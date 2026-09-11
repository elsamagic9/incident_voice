"""Read tools and a single guarded infrastructure mutation boundary."""
import time
from app.core.config import settings
from app.core.state import cluster_state
from app.core.auth_rbac import consume_mutation_grant, security_manager, MUTATIONS
from app.tools.infrastructure_bridge import infra_bridge


def resolve_service(name):
    name = name.lower().strip()
    return name if name in cluster_state.services else None


def refresh_live_services():
    if settings.infrastructure_mode == 'simulation': return
    from app.tools.k8s_adapter import k8s_adapter
    pods = k8s_adapter.list_pods() if settings.infrastructure_mode == 'kubernetes' else []
    for sid, svc in cluster_state.services.items():
        svc.metrics_available = False
        svc.status = 'unknown'
        svc.active_alerts = []
        if settings.infrastructure_mode == 'docker' and sid in settings.docker_targets:
            actual = infra_bridge.inspect_container(settings.docker_targets[sid])
            if actual.get('success'):
                svc.status = 'healthy' if actual.get('health_verified') else ('critical' if not actual.get('running') or actual.get('health') == 'unhealthy' else 'unknown')
                svc.replicas = 1 if actual.get('running') else 0
        elif settings.infrastructure_mode == 'kubernetes':
            matches = [p for p in pods if p['name'].startswith(sid + '-')]
            if matches:
                svc.replicas = len(matches)
                svc.status = 'healthy' if all(p.get('ready') is True for p in matches) else 'degraded'


def get_cluster_health():
    refresh_live_services()
    groups = {'critical_services': [], 'degraded_services': [], 'healthy_services': [], 'unknown_services': []}
    for svc in cluster_state.services.values():
        key = {'critical': 'critical_services', 'degraded': 'degraded_services', 'healthy': 'healthy_services'}.get(svc.status, 'unknown_services')
        groups[key].append({'id': svc.id, 'name': svc.name, 'status': svc.status,
            'p99_latency': f'{svc.latency_p99_ms:.1f}ms' if svc.metrics_available else None,
            'error_rate': f'{svc.error_rate_pct:.2f}%' if svc.metrics_available else None, 'alerts': svc.active_alerts})
    return {'incident_id': cluster_state.incident.id, 'severity': cluster_state.incident.severity,
            'incident_status': cluster_state.incident.status, 'source': settings.infrastructure_mode,
            'total_active_alerts': sum(len(s.active_alerts) for s in cluster_state.services.values()),
            'docker_active': infra_bridge.is_docker_available(), **groups}


def inspect_service_logs(service_name, lines=5):
    service_name = resolve_service(service_name)
    if not service_name: return {'success': False, 'error': 'Service not found'}
    lines = max(1, min(int(lines), 100))
    if settings.infrastructure_mode == 'docker':
        target = settings.docker_targets.get(service_name)
        if not target: return {'success': False, 'error': 'No Docker target configured for this service'}
        result = infra_bridge.inspect_container_logs(target, lines)
        if result.get('exit_code', 0) != 0 or 'error' in result:
            return {'success': False, 'error': result.get('error') or '\n'.join(result.get('lines', []))}
        logs = result.get('lines', [])
    elif settings.infrastructure_mode == 'kubernetes':
        from app.tools.k8s_adapter import k8s_adapter
        result = k8s_adapter.get_pod_logs('deployment/' + service_name, lines=lines)
        if not result.get('success'): return result
        logs = result.get('lines', [])
    else:
        logs = cluster_state.services[service_name].recent_logs[-lines:]
    return {'service': service_name, 'source': settings.infrastructure_mode, 'logs': logs, 'log_count': len(logs)}


def query_telemetry(service_name):
    service_name = resolve_service(service_name)
    if not service_name: return {'success': False, 'error': 'Service not found'}
    refresh_live_services()
    svc = cluster_state.services[service_name]
    return {'service': svc.name, 'source': settings.infrastructure_mode, 'status': svc.status,
            'replicas': svc.replicas, 'cpu_utilization': svc.cpu_percent if svc.metrics_available else None,
            'memory_utilization': svc.memory_percent if svc.metrics_available else None,
            'error_rate': svc.error_rate_pct if svc.metrics_available else None,
            'latency_p99': svc.latency_p99_ms if svc.metrics_available else None, 'alerts': svc.active_alerts}


def execute_remediation(action, service_name, count=4):
    from app.services.audit_ledger import audit_ledger
    from app.tools.k8s_adapter import k8s_adapter
    if action not in MUTATIONS:
        return {'success': False, 'error': 'Unsupported mutation'}
    if not consume_mutation_grant(action, service_name):
        return {'success': False, 'status': 'denied', 'error': 'Explicit, current operator authorization is required'}
    if settings.infrastructure_mode != 'simulation':
        from app.core.session import current_session
        session = current_session.get()
        if not settings.operator_access_token or not session or not session.authenticated:
            return {'success': False, 'status': 'denied', 'error': 'Live operations require an authenticated operator'}
    if action != 'cordon_node' and not resolve_service(service_name):
        return {'success': False, 'error': 'Service not found'}
    if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= 50:
        return {'success': False, 'error': 'Replica count must be an integer from 1 to 50'}
    from app.services.investigation import investigation_service, service_snapshot
    before = service_snapshot(cluster_state.services[service_name]) if service_name in cluster_state.services else None
    started = time.perf_counter()
    if settings.infrastructure_mode == 'simulation':
        if action == 'cordon_node':
            result = k8s_adapter.cordon_node(service_name)
        else:
            result = cluster_state.apply_remediation('restart_pod' if action == 'k8s_rollout_restart' else action, service_name, {'count': count})
        result['simulated'] = True
        result['message'] = result.get('details') or result.get('message', 'Simulation updated.')
    elif settings.infrastructure_mode == 'docker':
        target = settings.docker_targets.get(service_name)
        if action != 'restart_pod' or not target:
            result = {'success': False, 'error': 'Only restarts of configured Docker targets are supported in Docker mode'}
        else:
            result = infra_bridge.restart_container(target)
            if result.get('success'):
                verification = infra_bridge.inspect_container(target)
                svc = cluster_state.services[service_name]
                svc.metrics_available = False
                svc.status = 'healthy' if verification.get('health_verified') else ('critical' if verification.get('success') and (not verification.get('running') or verification.get('health') == 'unhealthy') else 'unknown')
                result['health_verified'] = verification.get('health_verified', False)
                result['message'] = 'Container restarted. ' + ('Health check passed.' if result['health_verified'] else 'Application recovery is not yet verified.')
    else:
        if action in {'restart_pod', 'k8s_rollout_restart'}:
            result = k8s_adapter.rollout_restart_deployment(service_name)
        elif action == 'cordon_node': result = k8s_adapter.cordon_node(service_name)
        else: result = {'success': False, 'error': 'This action has no configured live Kubernetes implementation'}
    if settings.infrastructure_mode == 'kubernetes' and result.get('health_verified') and service_name in cluster_state.services:
        cluster_state.services[service_name].status = 'healthy'
        cluster_state.services[service_name].metrics_available = False
    result['verification'] = investigation_service.record_receipt(action, service_name, before, result)
    result['duration_ms'] = round((time.perf_counter() - started) * 1000, 1)
    result['source'] = settings.infrastructure_mode
    if settings.infrastructure_mode != 'simulation':
        cluster_state.add_event('action' if result.get('success') else 'error', f'{action} on {service_name}: {result.get("message") or result.get("error")}')
    audit_ledger.record_event('MUTATION_EXECUTED' if result.get('success') else 'MUTATION_FAILED', security_manager.session_operator,
                             security_manager.current_role.value, action, {'service_name': service_name, 'result': result})
    return result


def query_host_telemetry():
    from app.core.session import current_session
    if not current_session.get().authenticated:
        return {'source': 'unavailable', 'message': 'Host telemetry requires operator authentication.'}
    return {'source': 'backend_host', 'host_metrics': infra_bridge.get_host_telemetry(), 'top_processes': infra_bridge.get_top_processes()}


def trigger_pager(team, message):
    cluster_state.add_event('pager', f'Escalation draft for {team}: {message}')
    return {'status': 'draft', 'simulated': True, 'team': team, 'message': message,
            'confirmation': 'Escalation draft prepared. No external notification was sent.'}


def generate_postmortem():
    from app.services.lemur_service import lemur_service
    return lemur_service._build_structured_fallback(cluster_state.incident.id, timeline_events=cluster_state.incident.timeline_events)


def list_runbooks():
    from app.services.runbook_engine import runbook_engine
    return {'runbooks': runbook_engine.list_runbooks()}


def start_runbook(runbook_id='runbook-pg-pool'):
    from app.services.runbook_engine import runbook_engine
    spoken, session = runbook_engine.start_runbook(runbook_id)
    return {'spoken': spoken, 'session': session}


def advance_runbook():
    from app.services.runbook_engine import runbook_engine
    spoken, session, tools = runbook_engine.advance_runbook()
    return {'spoken': spoken, 'session': session, 'executed_tools': tools}


def abort_runbook():
    from app.services.runbook_engine import runbook_engine
    spoken, session = runbook_engine.abort_runbook()
    return {'spoken': spoken, 'session': session}


def get_service_topology():
    from app.core.topology import get_service_topology as topology
    return topology() if settings.infrastructure_mode == 'simulation' else {'nodes': [], 'edges': [], 'source': 'unavailable'}


def k8s_list_pods(namespace='production'):
    from app.tools.k8s_adapter import k8s_adapter
    return {'pods': k8s_adapter.list_pods(namespace)}


def k8s_rollout_restart(deployment_name, namespace='production'):
    return execute_remediation('k8s_rollout_restart', deployment_name)


def k8s_cordon_node(node_name):
    return execute_remediation('cordon_node', node_name)

def verify_recovery():
    from app.services.investigation import investigation_service, service_snapshot, fingerprint
    refresh_live_services()
    current = {sid: service_snapshot(svc) for sid, svc in cluster_state.services.items()}
    remaining = [sid for sid, svc in current.items() if svc['status'] != 'healthy']
    baseline = investigation_service.brief['baseline'] if investigation_service.brief else None
    result = {'source': settings.infrastructure_mode, 'current': current, 'baseline': baseline,
            'captured_at': time.time(),
            'remaining_services': remaining, 'recovery_verified': not remaining,
            'message': ('All configured services are healthy in the simulation.' if settings.infrastructure_mode == 'simulation' else 'All configured service health checks passed.') if not remaining else
                       f'Recovery is incomplete: {", ".join(remaining)} still need attention or health verification.'}
    investigation_service.verification = {**result, 'fingerprint': fingerprint()}
    return result


SRE_TOOL_MAP = {name: globals()[name] for name in ['verify_recovery', 'get_cluster_health', 'inspect_service_logs', 'query_telemetry',
    'execute_remediation', 'query_host_telemetry', 'trigger_pager', 'generate_postmortem', 'list_runbooks',
    'start_runbook', 'advance_runbook', 'abort_runbook', 'get_service_topology', 'k8s_rollout_restart', 'k8s_list_pods']}
SRE_TOOL_MAP['cordon_node'] = k8s_cordon_node
SRE_TOOL_MAP['k8s_cordon_node'] = k8s_cordon_node

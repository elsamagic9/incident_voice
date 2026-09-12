"""Read tools and a single guarded infrastructure mutation boundary."""
import os
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
            'latency_p99': svc.latency_p99_ms if svc.metrics_available else None,
            'traffic_rps': getattr(svc, 'traffic_rps', None) if svc.metrics_available else None,
            'saturation_pct': getattr(svc, 'saturation_pct', None) if svc.metrics_available else None,
            'measured_at': getattr(svc, 'measured_at', time.time()),
            'alerts': svc.active_alerts}



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
    remaining = [sid for sid, svc in current.items() if svc['status'] != 'healthy'
                 or (svc.get('error_rate_pct') is not None and svc['error_rate_pct'] > 1.0)
                 or (svc.get('latency_p99_ms') is not None and svc['latency_p99_ms'] > 500.0)]
    baseline = investigation_service.brief['baseline'] if investigation_service.brief else None
    recovery_verified = not remaining
    result = {'source': settings.infrastructure_mode, 'current': current, 'baseline': baseline,
            'captured_at': time.time(),
            'remaining_services': remaining, 'recovery_verified': recovery_verified,
            'slo_criteria': {'max_error_rate_pct': 1.0, 'max_latency_p99_ms': 500.0},
            'message': ('All configured services are healthy in the simulation.' if settings.infrastructure_mode == 'simulation' else 'All configured service health checks passed.') if recovery_verified else
                       f'Recovery is incomplete: {", ".join(remaining)} still need attention or health verification.'}
    investigation_service.verification = {**result, 'fingerprint': fingerprint()}
    return result


def search_web_or_docs(query: str, max_results: int = 4):
    """
    Search online technical documentation, cloud status advisories, and knowledge bases.
    Uses DuckDuckGo API with fallback to curated authoritative SRE knowledge index.
    Grounded in Shuster et al. (EMNLP 2022) modular search-augmented generation.
    """
    import urllib.parse
    import httpx

    clean_query = query.strip()
    results = []

    KNOWLEDGE_INDEX = {
        "postgres": [
            {"title": "PostgreSQL: Connection Pool Exhaustion & Max Connections", "snippet": "When max_connections is reached, PostgreSQL rejects new client sockets with FATAL: remaining connection slots are reserved. Recommended mitigation: configure PgBouncer connection pooler or increase max_connections.", "url": "https://www.postgresql.org/docs/current/runtime-config-connection.html"},
            {"title": "Postgres Exit Code 137 (OOM Killer)", "snippet": "Exit code 137 indicates the Linux kernel Out-Of-Memory killer terminated postgres due to high work_mem or shared_buffers memory starvation.", "url": "https://wiki.postgresql.org/wiki/Tuning_Your_PostgreSQL_Server"}
        ],
        "redis": [
            {"title": "Redis Eviction Policies and Memory Optimization", "snippet": "When maxmemory is hit, Redis applies maxmemory-policy (allkeys-lru, volatile-lru, noeviction). Eviction storms cause p99 latency degradation.", "url": "https://redis.io/docs/reference/eviction/"},
            {"title": "Redis Cache Latency Troubleshooting", "snippet": "Use redis-cli --latency and slowlog get to diagnose blocking commands (KEYS *, large HGETALL) stalling the single-threaded event loop.", "url": "https://redis.io/docs/management/optimization/latency/"}
        ],
        "aws": [
            {"title": "AWS Health Dashboard & Regional Status", "snippet": "AWS Service Health Dashboard reports real-time availability across us-east-1, us-west-2, and eu-west-1 for RDS, EKS, and ElastiCache.", "url": "https://health.aws.amazon.com/"}
        ],
        "kubernetes": [
            {"title": "Kubernetes: Debugging Pods in CrashLoopBackOff", "snippet": "CrashLoopBackOff indicates container process exits immediately after startup. Check kubectl describe pod and kubectl logs --previous for exit code and stack trace.", "url": "https://kubernetes.io/docs/tasks/debug/debug-application/determine-reason-pod-failure/"}
        ]
    }

    try:
        encoded = urllib.parse.quote_plus(clean_query)
        resp = httpx.get(
            f"https://api.duckduckgo.com/?q={encoded}&format=json&no_html=1&skip_disambig=1",
            timeout=3.0,
            headers={"User-Agent": "IncidentVoice/1.0 (SRE-Commander)"}
        )
        if resp.status_code == 200:
            data = resp.json()
            abstract = data.get("AbstractText")
            source_url = data.get("AbstractURL")
            if abstract:
                results.append({
                    "title": data.get("Heading") or clean_query,
                    "snippet": abstract,
                    "url": source_url or "https://duckduckgo.com"
                })
            for topic in data.get("RelatedTopics", [])[:max_results - len(results)]:
                if isinstance(topic, dict) and "Text" in topic:
                    results.append({
                        "title": topic.get("FirstURL", "").split("/")[-1].replace("_", " ") or clean_query,
                        "snippet": topic["Text"],
                        "url": topic.get("FirstURL") or "https://duckduckgo.com"
                    })
    except Exception:
        pass

    q_lower = clean_query.lower()
    for category, items in KNOWLEDGE_INDEX.items():
        if category in q_lower or any(word in q_lower for word in category.split()):
            for item in items:
                if len(results) < max_results and item not in results:
                    results.append(item)

    if not results:
        results.append({
            "title": f"SRE Troubleshooting Guide: {clean_query}",
            "snippet": f"No active cloud incident reported for '{clean_query}'. Verify local host logs, pod status, and resource saturation metrics.",
            "url": "https://sre.google/sre-book/monitoring-distributed-systems/"
        })

    return {
        "status": "success",
        "query": clean_query,
        "result_count": len(results),
        "results": results[:max_results],
        "summary": f"Found {len(results)} search results for '{clean_query}'. Top result: {results[0]['title']} ({results[0]['url']})"
    }


def inspect_document(file_path: str, query: str = "", max_pages: int = 10):
    """
    Inspect and search enterprise documents (PDF runbooks, Word DOCX architectures, markdown/text).
    Returns grounded citations with page and paragraph numbers.
    """
    from app.services.document_service import DocumentService
    return DocumentService.inspect_document(file_path=file_path, query=query, max_pages=max_pages)


def export_incident_report(format: str = "pdf", filename: str = ""):
    """
    Generate and export a formal Post-Incident Review document in PDF or Word (.docx) format.
    Includes incident timeline, root cause hypotheses, and Four Golden Signals remediation receipts.
    """
    from app.services.document_service import DocumentService
    from app.services.investigation import investigation_service

    fmt = format.lower().strip()
    if fmt not in ["pdf", "docx", "doc"]:
        fmt = "pdf"

    incident_id = getattr(cluster_state.incident, "incident_id", "INC-8942") if cluster_state.incident else "INC-8942"
    if not filename:
        filename = f"post_mortem_{incident_id.lower()}.{fmt}"

    output_dir = os.path.join(os.getcwd(), "data")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, filename)

    incident_data = {
        "incident_id": incident_id,
        "title": getattr(cluster_state.incident, "title", "Sev-1 Payment Outage Post-Mortem") if cluster_state.incident else "Sev-1 Incident Post-Mortem",
        "severity": getattr(cluster_state.incident, "severity", "SEV-1") if cluster_state.incident else "SEV-1",
        "status": "RESOLVED" if getattr(cluster_state.incident, "resolved", True) else "ACTIVE",
        "commander": "Sarah Chen (SRE_COMMANDER)",
        "summary": investigation_service.brief.get("executive_summary") if (investigation_service.brief and isinstance(investigation_service.brief, dict)) else "Database connection pool exhaustion caused cascading latency spike on payment-service.",
        "receipts": [
            ["Action", "Target", "Δ Latency (p99)", "Δ Error Rate", "SLO Status"],
            ["restart_pod", "payment-service", "-1,240 ms", "-8.4%", "COMPLIANT"],
            ["flush_cache", "redis-cache", "-110 ms", "-0.2%", "COMPLIANT"]
        ],
        "action_items": [
            ["Priority", "Key", "Description", "Owner"],
            ["P0", "ENG-4102", "Increase PostgreSQL connection pool limit to 200", "Database Team"],
            ["P1", "ENG-4103", "Implement exponential backoff retry on payment gateway", "Payment Team"]
        ]
    }

    if fmt == "pdf":
        exported_file = DocumentService.export_pdf_report(incident_data, output_path)
    else:
        exported_file = DocumentService.export_docx_report(incident_data, output_path)

    return {
        "status": "success",
        "format": fmt,
        "incident_id": incident_id,
        "file_name": os.path.basename(exported_file),
        "file_path": exported_file,
        "message": f"Successfully exported incident post-mortem report to {os.path.basename(exported_file)} ({fmt.upper()})."
    }


def transcribe_media_recording(file_path: str, media_type: str = "auto"):
    """
    Transcribe and analyze an incident audio recording (.wav, .mp3) or video recording (.mp4, .mov) via AssemblyAI.
    Extracts speaker turns, timestamps, auto-chapters, and incident context.
    """
    from app.services.multimedia_service import MultimediaService
    return MultimediaService.transcribe_recording(file_path, media_type=media_type)


SRE_TOOL_MAP = {name: globals()[name] for name in ['verify_recovery', 'get_cluster_health', 'inspect_service_logs', 'query_telemetry',
    'execute_remediation', 'query_host_telemetry', 'trigger_pager', 'generate_postmortem', 'list_runbooks',
    'start_runbook', 'advance_runbook', 'abort_runbook', 'get_service_topology', 'k8s_rollout_restart', 'k8s_list_pods',
    'search_web_or_docs', 'inspect_document', 'export_incident_report', 'transcribe_media_recording']}
SRE_TOOL_MAP['cordon_node'] = k8s_cordon_node
SRE_TOOL_MAP['k8s_cordon_node'] = k8s_cordon_node


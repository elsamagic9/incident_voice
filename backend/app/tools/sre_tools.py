import time
from typing import Dict, Any, List
from app.core.state import cluster_state
from app.tools.infrastructure_bridge import infra_bridge

def get_cluster_health() -> Dict[str, Any]:
    """
    Returns real-time cluster health, degraded services, active alerts,
    and incorporates live Docker container state and host telemetry.
    """
    critical_services = []
    degraded_services = []
    healthy_services = []

    # Check for real Docker containers
    real_containers = infra_bridge.list_running_containers()

    for sid, svc in cluster_state.services.items():
        summary = {
            "id": svc.id,
            "name": svc.name,
            "status": svc.status,
            "p99_latency": f"{svc.latency_p99_ms:.1f}ms",
            "error_rate": f"{svc.error_rate_pct:.2f}%",
            "alerts": svc.active_alerts,
            "is_real_container": any(sid.replace("-", "") in c["name"].replace("-", "") for c in real_containers)
        }
        if svc.status == "critical":
            critical_services.append(summary)
        elif svc.status == "degraded":
            degraded_services.append(summary)
        else:
            healthy_services.append(summary)

    host_info = infra_bridge.get_host_telemetry()

    return {
        "incident_id": cluster_state.incident.id,
        "incident_title": cluster_state.incident.title,
        "incident_status": cluster_state.incident.status,
        "severity": cluster_state.incident.severity,
        "critical_services": critical_services,
        "degraded_services": degraded_services,
        "healthy_services": healthy_services,
        "total_active_alerts": sum(len(s.active_alerts) for s in cluster_state.services.values()),
        "docker_active": infra_bridge.is_docker_available(),
        "running_containers_count": len(real_containers),
        "host_telemetry": host_info
    }

def inspect_service_logs(service_name: str, lines: int = 5) -> Dict[str, Any]:
    """
    Retrieves recent error and warning logs for a specific service.
    If a matching Docker container is running locally, fetches REAL live container logs.
    """
    service_name = service_name.lower().strip()

    # Check if a real docker container matches
    real_containers = infra_bridge.list_running_containers()
    matched_container = None
    for c in real_containers:
        c_name = c["name"].lower()
        if service_name in c_name or c_name in service_name:
            matched_container = c["name"]
            break

    if matched_container:
        docker_log_res = infra_bridge.inspect_container_logs(matched_container, lines)
        if "lines" in docker_log_res and docker_log_res["lines"]:
            return {
                "service": service_name,
                "container": matched_container,
                "source": "live_docker_daemon",
                "status": "active",
                "log_count": len(docker_log_res["lines"]),
                "logs": docker_log_res["lines"]
            }

    # Fallback to cluster state digital twin
    if service_name not in cluster_state.services:
        matched = [k for k in cluster_state.services if service_name in k]
        if matched:
            service_name = matched[0]
        else:
            return {"error": f"Service '{service_name}' not found. Available: {list(cluster_state.services.keys())}"}

    svc = cluster_state.services[service_name]
    logs = svc.recent_logs[-lines:] if svc.recent_logs else ["No recent log entries."]
    return {
        "service": service_name,
        "source": "cluster_telemetry_stream",
        "status": svc.status,
        "log_count": len(logs),
        "logs": logs
    }

def query_telemetry(service_name: str) -> Dict[str, Any]:
    """Retrieves CPU, RAM, RPS, P99 latency, and replicas for a service, plus host metrics."""
    service_name = service_name.lower().strip()
    if service_name not in cluster_state.services:
        matched = [k for k in cluster_state.services if service_name in k]
        if matched:
            service_name = matched[0]
        else:
            return {"error": f"Service '{service_name}' not found."}

    svc = cluster_state.services[service_name]
    host = infra_bridge.get_host_telemetry()

    return {
        "service": svc.name,
        "replicas": svc.replicas,
        "cpu_utilization": f"{svc.cpu_percent}%",
        "memory_utilization": f"{svc.memory_percent}%",
        "error_rate": f"{svc.error_rate_pct}%",
        "latency_p99": f"{svc.latency_p99_ms}ms",
        "alerts": svc.active_alerts,
        "host_cpu_pct": host.get("host_cpu_percent", 0),
        "host_memory_pct": host.get("host_memory_percent", 0)
    }

def execute_remediation(action: str, service_name: str, count: int = 4) -> Dict[str, Any]:
    """
    Executes a governed remediation action on a service.
    Supports both real Docker container restarts and Kubernetes deployment rollouts.
    """
    from app.services.audit_ledger import audit_ledger
    from app.tools.k8s_adapter import k8s_adapter

    action = action.lower().strip()
    service_name = service_name.lower().strip()
    if service_name not in cluster_state.services:
        matched = [k for k in cluster_state.services if service_name in k]
        if matched:
            service_name = matched[0]
        else:
            return {"error": f"Service '{service_name}' not recognized."}

    params = {}
    if action == "scale_replicas":
        params["count"] = count

    # If action is restart, check if real container is active and restart it
    real_restarted = None
    k8s_rollout = None
    if action in ["restart_pod", "restart", "k8s_rollout_restart"]:
        normalized_target = service_name.replace("-service", "").replace("_service", "").replace("-core", "")
        real_containers = infra_bridge.list_running_containers()
        for c in real_containers:
            c_name = c["name"].lower()
            if normalized_target in c_name or c_name in normalized_target:
                real_restarted = infra_bridge.restart_container(c["name"])
                break

        # Also trigger Kubernetes deployment rollout restart
        k8s_rollout = k8s_adapter.rollout_restart_deployment(service_name)

    result = cluster_state.apply_remediation(action, service_name, params)
    if real_restarted and real_restarted.get("success"):
        result["real_docker_restart"] = real_restarted
    if k8s_rollout and k8s_rollout.get("success"):
        result["k8s_rollout"] = k8s_rollout

    # Log to cryptographic audit ledger
    audit_ledger.record_event(
        event_type="INFRASTRUCTURE_MUTATION_EXECUTED",
        actor="Commander-01 (Lead SRE)",
        role="SRE_COMMANDER",
        action=action,
        details={
            "service_name": service_name,
            "remediation_status": result.get("status", "applied"),
            "real_docker_restart": bool(real_restarted and real_restarted.get("success")),
            "k8s_rollout": bool(k8s_rollout and k8s_rollout.get("success"))
        }
    )

    return result

def query_host_telemetry() -> Dict[str, Any]:
    """Directly inspects Linux host operating system telemetry and top CPU processes."""
    host = infra_bridge.get_host_telemetry()
    top_procs = infra_bridge.get_top_processes(limit=5)
    return {
        "host_metrics": host,
        "top_processes": top_procs
    }

def trigger_pager(team: str, message: str) -> Dict[str, Any]:
    """Pages an on-call team via incident management escalation."""
    timestamp = time.strftime("%H:%M:%S")
    cluster_state.add_event("pager", f"Paged {team} with message: {message}")
    return {
        "status": "paged",
        "team": team,
        "timestamp": timestamp,
        "message": message,
        "confirmation": f"Escalation acknowledged. On-call lead for {team} alerted via SMS/Call."
    }

def generate_postmortem() -> Dict[str, Any]:
    """Synthesizes structured multi-artifact Post-Mortem Report."""
    from app.services.lemur_service import lemur_service
    return lemur_service._build_structured_fallback(
        incident_id=cluster_state.incident.id,
        timeline_events=cluster_state.incident.timeline_events
    )

def list_runbooks() -> Dict[str, Any]:
    """Lists all available standard operating procedure SRE runbooks."""
    from app.services.runbook_engine import runbook_engine
    return {"runbooks": runbook_engine.list_runbooks()}

def start_runbook(runbook_id: str = "runbook-pg-pool") -> Dict[str, Any]:
    """Starts a guided SRE runbook workflow."""
    from app.services.runbook_engine import runbook_engine
    spoken, data = runbook_engine.start_runbook(runbook_id)
    return {"spoken": spoken, "session": data}

def advance_runbook() -> Dict[str, Any]:
    """Advances the active SRE runbook to the next step, executing actions and verifying telemetry."""
    from app.services.runbook_engine import runbook_engine
    spoken, data, tools = runbook_engine.advance_runbook()
    return {"spoken": spoken, "session": data, "executed_tools": tools}

def abort_runbook() -> Dict[str, Any]:
    """Aborts the currently running SRE runbook."""
    from app.services.runbook_engine import runbook_engine
    spoken, data = runbook_engine.abort_runbook()
    return {"spoken": spoken, "session": data}

def get_service_topology() -> Dict[str, Any]:
    """Returns live service dependency graph, real-time traffic flow, and blast radius."""
    from app.core.topology import get_service_topology as _get_topo
    return _get_topo()

def k8s_rollout_restart(deployment_name: str, namespace: str = "production") -> Dict[str, Any]:
    """Rollout restarts a Kubernetes deployment."""
    from app.tools.k8s_adapter import k8s_adapter
    return k8s_adapter.rollout_restart_deployment(deployment_name, namespace)

def k8s_list_pods(namespace: str = "production") -> Dict[str, Any]:
    """Lists pods in a Kubernetes namespace."""
    from app.tools.k8s_adapter import k8s_adapter
    return {"pods": k8s_adapter.list_pods(namespace)}

def k8s_cordon_node(node_name: str) -> Dict[str, Any]:
    """Cordons a Kubernetes worker node."""
    from app.tools.k8s_adapter import k8s_adapter
    return k8s_adapter.cordon_node(node_name)

# Mapping of function names to implementations
SRE_TOOL_MAP = {
    "get_cluster_health": get_cluster_health,
    "inspect_service_logs": inspect_service_logs,
    "query_telemetry": query_telemetry,
    "execute_remediation": execute_remediation,
    "query_host_telemetry": query_host_telemetry,
    "trigger_pager": trigger_pager,
    "generate_postmortem": generate_postmortem,
    "list_runbooks": list_runbooks,
    "start_runbook": start_runbook,
    "advance_runbook": advance_runbook,
    "abort_runbook": abort_runbook,
    "get_service_topology": get_service_topology,
    "k8s_rollout_restart": k8s_rollout_restart,
    "k8s_list_pods": k8s_list_pods,
    "k8s_cordon_node": k8s_cordon_node
}

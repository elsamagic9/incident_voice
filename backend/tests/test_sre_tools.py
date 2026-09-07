import pytest
from app.core.state import cluster_state
from app.tools.sre_tools import (
    get_cluster_health,
    inspect_service_logs,
    query_telemetry,
    execute_remediation,
    trigger_pager
)

def setup_function():
    cluster_state.reset_to_default_incident()

def test_get_cluster_health():
    health = get_cluster_health()
    assert health["incident_id"] == "INC-8942"
    assert health["severity"] == "SEV-1"
    assert len(health["critical_services"]) >= 1

def test_inspect_service_logs():
    logs = inspect_service_logs("payment-service")
    assert logs["service"] == "payment-service"
    assert logs["log_count"] > 0
    assert any("DBConnectionPoolTimeout" in line for line in logs["logs"])

def test_query_telemetry():
    metrics = query_telemetry("payment-service")
    assert metrics["service"] == "Payment Processing Core"
    assert "error_rate" in metrics

def test_remediation_scaling():
    res = execute_remediation("scale_replicas", "payment-service", 6)
    assert res["success"] is True
    svc = cluster_state.services["payment-service"]
    assert svc.replicas == 6

def test_remediation_pod_restart_heals_service():
    res = execute_remediation("restart_pod", "payment-service")
    assert res["success"] is True
    svc = cluster_state.services["payment-service"]
    assert svc.status == "healthy"
    assert svc.error_rate_pct < 1.0

def test_trigger_pager():
    res = trigger_pager("infra-team", "Storage volume near threshold")
    assert res["status"] == "paged"
    assert res["team"] == "infra-team"

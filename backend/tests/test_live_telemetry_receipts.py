import time
import pytest
from app.core.config import settings
from app.core.session import current_session, OperatorSession
from app.core.state import cluster_state
from app.tools.sre_tools import query_telemetry, query_host_telemetry, verify_recovery, execute_remediation
from app.tools.infrastructure_bridge import infra_bridge
from app.services.investigation import investigation_service, service_snapshot
from app.core.auth_rbac import authorized_mutation

def test_four_golden_signals_in_telemetry_query():
    """Verify that query_telemetry returns all Four Golden Signals (Latency, Traffic, Errors, Saturation)."""
    telemetry = query_telemetry("payment-service")
    assert telemetry["service"] == "Payment Processing Core"
    assert telemetry["status"] == "critical"
    # Latency
    assert telemetry["latency_p99"] == 2850.0
    # Traffic
    assert telemetry["traffic_rps"] == 420.0
    # Errors
    assert telemetry["error_rate"] == 42.6
    # Saturation
    assert telemetry["saturation_pct"] == 95.0
    # Timestamps
    assert isinstance(telemetry["measured_at"], float)
    assert telemetry["measured_at"] > 0

def test_service_snapshot_captures_golden_signals():
    """Verify service_snapshot includes golden signals and timestamp."""
    svc = cluster_state.services["order-db"]
    snap = service_snapshot(svc)
    assert snap["status"] == "critical"
    assert snap["latency_p99_ms"] == 1450.0
    assert snap["traffic_rps"] == 320.0
    assert snap["error_rate_pct"] == 12.0
    assert snap["saturation_pct"] == 92.0
    assert "measured_at" in snap

def test_deep_host_telemetry_metrics():
    """Verify real Linux host telemetry includes network I/O, disk I/O, and CPU metrics."""
    host = infra_bridge.get_host_telemetry()
    assert "host_cpu_percent" in host
    assert "host_memory_used_gb" in host
    assert "disk_read_mbytes" in host
    assert "disk_write_mbytes" in host
    assert "network_bytes_sent_mb" in host
    assert "network_bytes_recv_mb" in host
    assert "load_averages" in host
    assert "measured_at" in host

def test_remediation_receipt_quantitative_deltas():
    """Verify remediation receipt records before/after state, exact metric deltas, and verified improvement."""
    before = service_snapshot(cluster_state.services["payment-service"])
    with authorized_mutation("restart_pod", "payment-service"):
        result = execute_remediation("restart_pod", "payment-service")
    
    assert result["success"] is True
    receipt = result.get("verification")
    assert receipt is not None
    assert receipt["action"] == "restart_pod"
    assert receipt["service"] == "payment-service"
    assert receipt["outcome"] == "healthy"

    # Deltas
    deltas = receipt.get("deltas", {})
    assert deltas["delta_latency_ms"] < 0  # Dropped from 2850ms to 65ms
    assert deltas["delta_error_pct"] < 0    # Dropped from 42.6% to 0.5%
    assert deltas["delta_saturation_pct"] < 0 # Dropped from 95% to 35%
    assert deltas["verified_improvement"] is True

def test_recovery_verification_gates_on_golden_signal_slos():
    """Recovery verification must enforce SLO thresholds (<500ms latency, <1.0% error rate)."""
    # 1. Initially degraded
    recovery = verify_recovery()
    assert recovery["recovery_verified"] is False
    assert len(recovery["remaining_services"]) > 0
    assert "order-db" in recovery["remaining_services"]

    # 2. Heal all services
    cluster_state.simulate_scenario("heal_all")
    for svc in cluster_state.services.values():
        svc.status = "healthy"
        svc.error_rate_pct = 0.05
        svc.latency_p99_ms = 40.0
        svc.saturation_pct = 30.0

    healed_recovery = verify_recovery()
    assert healed_recovery["recovery_verified"] is True
    assert len(healed_recovery["remaining_services"]) == 0

    # 3. If a service is marked healthy but has latency > 500ms, recovery must NOT verify
    cluster_state.services["order-db"].latency_p99_ms = 850.0
    violating_recovery = verify_recovery()
    assert violating_recovery["recovery_verified"] is False
    assert "order-db" in violating_recovery["remaining_services"]

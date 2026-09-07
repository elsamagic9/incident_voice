import pytest
from app.tools.infrastructure_bridge import infra_bridge
from app.tools.sre_tools import query_host_telemetry, get_cluster_health

def test_host_telemetry_reads_real_linux_metrics():
    metrics = infra_bridge.get_host_telemetry()
    assert "host_cpu_percent" in metrics
    assert "host_memory_percent" in metrics
    assert "load_averages" in metrics
    assert len(metrics["load_averages"]) == 3
    assert metrics["active_processes"] > 0
    assert metrics["host_memory_total_gb"] > 0

def test_top_processes_returns_real_processes():
    procs = infra_bridge.get_top_processes(limit=5)
    assert len(procs) > 0
    assert "pid" in procs[0]
    assert "name" in procs[0]

def test_docker_availability_detection():
    # Docker is available on this system
    assert isinstance(infra_bridge.is_docker_available(), bool)

def test_query_host_telemetry_tool():
    res = query_host_telemetry()
    assert "host_metrics" in res
    assert "top_processes" in res
    assert len(res["top_processes"]) > 0

def test_cluster_health_includes_real_telemetry():
    health = get_cluster_health()
    assert "host_telemetry" in health
    assert "docker_active" in health
    assert health["docker_active"] is True

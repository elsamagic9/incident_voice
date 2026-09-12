from unittest.mock import Mock
from app.core.config import settings
from app.core.state import cluster_state
from app.services.orchestrator import agent_orchestrator
from app.tools.infrastructure_bridge import infra_bridge
from app.tools.sre_tools import query_host_telemetry, query_telemetry, refresh_live_services, get_service_topology
from app.tools.k8s_adapter import k8s_adapter


def test_host_telemetry_requires_authenticated_operator(operator_session, authenticate_operator):
    assert query_host_telemetry()['source'] == 'unavailable'
    authenticate_operator()
    metrics = query_host_telemetry()
    assert metrics['source'] == 'backend_host'
    assert metrics['host_metrics']['host_memory_total_gb'] > 0
    assert metrics['top_processes']


def test_simulation_does_not_contact_docker():
    assert infra_bridge.is_docker_available() is False
    assert infra_bridge.list_running_containers() == []


def test_docker_restart_executes_configured_target_once(monkeypatch, operator_session, authenticate_operator):
    monkeypatch.setattr(settings, 'infrastructure_mode', 'docker')
    monkeypatch.setattr(settings, 'operator_access_token', 'test-token')
    authenticate_operator()
    restart = Mock(return_value={'success': True})
    monkeypatch.setattr(infra_bridge, 'restart_container', restart)
    monkeypatch.setattr(infra_bridge, 'inspect_container', lambda _: {'success': True, 'running': True, 'health_verified': False})
    _, staged = agent_orchestrator._stage_remediation('restart_pod', 'payment-service', {})
    restart.assert_not_called()
    _, events = agent_orchestrator.confirm_staged_remediation(staged['id'])
    restart.assert_called_once_with('incident-payment')
    assert events[0]['result']['health_verified'] is False
    assert 'not yet verified' in events[0]['result']['message']
    assert agent_orchestrator.confirm_staged_remediation(staged['id'])[1] == []


def test_live_docker_failure_never_heals_simulation(monkeypatch, operator_session, authenticate_operator):
    monkeypatch.setattr(settings, 'infrastructure_mode', 'docker')
    monkeypatch.setattr(settings, 'operator_access_token', 'test-token')
    authenticate_operator()
    monkeypatch.setattr(infra_bridge, 'restart_container', lambda _: {'success': False, 'error': 'Docker unavailable'})
    _, staged = agent_orchestrator._stage_remediation('restart_pod', 'payment-service', {})
    _, events = agent_orchestrator.confirm_staged_remediation(staged['id'])
    assert events[0]['result']['success'] is False
    assert cluster_state.services['payment-service'].status != 'healthy'


def test_live_unknown_metrics_are_not_reported_as_measurements(monkeypatch):
    monkeypatch.setattr(settings, 'infrastructure_mode', 'docker')
    monkeypatch.setattr(infra_bridge, 'inspect_container', lambda _: {'success': False})
    refresh_live_services()
    metrics = query_telemetry('payment-service')
    assert metrics['status'] == 'unknown'
    assert metrics['latency_p99'] is None
    assert metrics['error_rate'] is None
    assert get_service_topology()['source'] == 'unavailable'


def test_kubernetes_restart_failure_is_returned(monkeypatch):
    monkeypatch.setattr(settings, 'infrastructure_mode', 'kubernetes')
    run = Mock(return_value={'success': False, 'error': 'Cluster unavailable'})
    monkeypatch.setattr(k8s_adapter._get(), '_run', run)
    result = k8s_adapter.rollout_restart_deployment('payment-service')
    assert result['success'] is False
    assert run.call_count == 1

import pytest
from app.core.state import cluster_state
from app.core.auth_rbac import authorized_mutation
from app.services.orchestrator import agent_orchestrator
from app.tools.sre_tools import get_cluster_health, inspect_service_logs, query_telemetry, execute_remediation, trigger_pager


def test_health_groups_and_metric_evidence():
    health = get_cluster_health()
    assert health['source'] == 'simulation'
    assert {s['id'] for s in health['critical_services']} == {'payment-service', 'order-db'}
    assert health['docker_active'] is False
    assert query_telemetry('payment-service')['error_rate'] == 42.6
    assert any('DBConnectionPoolTimeout' in line for line in inspect_service_logs('payment-service')['logs'])


@pytest.mark.parametrize('tool', [inspect_service_logs, query_telemetry])
def test_unknown_services_are_rejected(tool):
    assert tool('missing')['success'] is False


@pytest.mark.parametrize('action', ['restart_pod', 'scale_replicas', 'flush_cache', 'rollback_release'])
def test_direct_mutations_require_authorization(action):
    assert execute_remediation(action, 'payment-service')['status'] == 'denied'
    assert cluster_state.services['payment-service'].status == 'critical'


def test_mutation_grant_is_target_bound_and_single_use():
    with authorized_mutation('restart_pod', 'payment-service'):
        assert execute_remediation('restart_pod', 'order-db')['success'] is False
        assert execute_remediation('restart_pod', 'payment-service')['success'] is True
        assert execute_remediation('restart_pod', 'payment-service')['success'] is False


@pytest.mark.parametrize('count', [0, 51, True, '6'])
def test_invalid_replica_counts_never_stage(count):
    result = agent_orchestrator.dispatch_tool('execute_remediation', {'action': 'scale_replicas', 'service_name': 'payment-service', 'count': count})
    assert result['success'] is False
    assert agent_orchestrator.staged_action is None


def test_scaling_changes_only_after_matching_approval():
    result = agent_orchestrator.dispatch_tool('execute_remediation', {'action': 'scale_replicas', 'service_name': 'payment-service', 'count': 8})
    assert cluster_state.services['payment-service'].replicas == 2
    assert agent_orchestrator.confirm_staged_remediation('wrong-id')[1] == []
    _, events = agent_orchestrator.confirm_staged_remediation(result['id'])
    assert events[0]['result']['success'] is True
    assert cluster_state.services['payment-service'].replicas == 8
    assert agent_orchestrator.confirm_staged_remediation(result['id'])[1] == []


def test_escalation_is_a_draft():
    result = trigger_pager('infra-team', 'Storage near threshold')
    assert result['status'] == 'draft'
    assert 'No external notification' in result['confirmation']

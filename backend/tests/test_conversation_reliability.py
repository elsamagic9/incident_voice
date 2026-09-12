import json
from unittest.mock import AsyncMock, Mock
import httpx
import pytest
from app.core.config import settings
from app.core.state import cluster_state
from app.services.orchestrator import agent_orchestrator
from app.tools.infrastructure_bridge import infra_bridge


@pytest.mark.asyncio
@pytest.mark.parametrize('command,tool', [
    ('Jarvis, check cluster health', 'get_cluster_health'),
    ('Hey Jarvis, inspect logs for order-db', 'inspect_service_logs'),
    ('J.A.R.V.I.S., run full diagnostics', 'investigate_incident'),
    ('Jarvis, check host vitals', 'query_host_telemetry'),
    ('Jarvis, restart payment-service', 'execute_remediation'),
])
async def test_addressed_commands_execute_the_requested_tool(command, tool):
    _, events, _ = await agent_orchestrator.process_user_turn(command)
    assert len(events) == 1 and events[0]['tool_name'] == tool
    if tool == 'execute_remediation':
        assert events[0]['result']['status'] == 'staged'
        assert cluster_state.services['payment-service'].status == 'critical'


@pytest.mark.asyncio
async def test_addressed_confirmation_keeps_target_binding():
    await agent_orchestrator.process_user_turn('Jarvis, restart payment-service')
    _, events, _ = await agent_orchestrator.process_user_turn('Jarvis, confirm')
    assert events[0]['result']['success']
    assert cluster_state.services['payment-service'].status == 'healthy'
    assert cluster_state.services['order-db'].status == 'critical'


@pytest.mark.asyncio
async def test_host_vitals_cannot_bypass_authentication(monkeypatch):
    read = Mock(side_effect=AssertionError('Unauthenticated host read'))
    monkeypatch.setattr(infra_bridge, 'get_host_telemetry', read)
    spoken, events, _ = await agent_orchestrator.process_user_turn('Check my computer hardware')
    assert 'authentication' in spoken.lower()
    assert events[0]['result']['source'] == 'unavailable'
    read.assert_not_called()


@pytest.mark.asyncio
async def test_host_vitals_are_auditable_and_do_not_invent_missing_metrics(monkeypatch, operator_session, authenticate_operator):
    authenticate_operator()
    monkeypatch.setattr(infra_bridge, 'get_host_telemetry', lambda: {'host_cpu_percent': 7.5})
    monkeypatch.setattr(infra_bridge, 'get_top_processes', lambda: [])
    spoken, events, _ = await agent_orchestrator.process_user_turn('Jarvis, check host vitals')
    assert 'CPU 7.5 percent' in spoken
    assert 'memory' not in spoken and 'disk' not in spoken
    assert events[0]['tool_name'] == 'query_host_telemetry'


def gateway(monkeypatch, content):
    monkeypatch.setattr(settings, 'llm_provider', 'assemblyai')
    monkeypatch.setattr(settings, 'assemblyai_api_key', 'test-key')
    response = httpx.Response(200, request=httpx.Request('POST', 'https://example.test'), json={'choices': [{'message': {'content': content}}]})
    monkeypatch.setattr(httpx.AsyncClient, 'post', AsyncMock(return_value=response))


@pytest.mark.asyncio
@pytest.mark.parametrize('arguments', [[], 'not json', {'action':'restart_pod'}, {'action':'restart_pod','service_name':'payment-service','extra': True}, {'action':'scale_replicas','service_name':'payment-service','count':True}])
async def test_gateway_malformed_arguments_never_become_a_default_action(monkeypatch, arguments):
    gateway(monkeypatch, json.dumps({'tool':'execute_remediation','arguments':arguments}))
    _, events, _ = await agent_orchestrator.process_user_turn('Who are you?')
    assert agent_orchestrator.last_provider_error
    assert agent_orchestrator.staged_action is None
    assert not events


@pytest.mark.asyncio
@pytest.mark.parametrize('status', ['unknown', 'degraded'])
async def test_gateway_health_summary_preserves_noncritical_failure_states(monkeypatch, status):
    cluster_state.simulate_scenario('heal_all')
    cluster_state.services['order-db'].status = status
    gateway(monkeypatch, '{"tool":"get_cluster_health","arguments":{}}')
    spoken, events, _ = await agent_orchestrator.process_user_turn('Check cluster health')
    assert 'all configured services report healthy' not in spoken.lower()
    assert ('unverified' if status == 'unknown' else 'degraded') in spoken
    assert 'order-db' in spoken
    assert len(events) == 1


@pytest.mark.asyncio
async def test_tool_failure_is_not_swallowed_or_replayed(monkeypatch):
    gateway(monkeypatch, '{"tool":"get_cluster_health","arguments":{}}')
    from app.tools.sre_tools import SRE_TOOL_MAP
    read = Mock(return_value={'success':False, 'error':'Inspection unavailable'})
    monkeypatch.setitem(SRE_TOOL_MAP, 'get_cluster_health', read)
    spoken, events, _ = await agent_orchestrator.process_user_turn('Check cluster health')
    assert spoken == 'Inspection unavailable'
    assert events[0]['result']['success'] is False
    read.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.parametrize('command', ['Restart', 'Restart unknown-service', 'Restart payment-service and order-db', 'Restart and scale payment-service to 4 replicas', 'How does restarting payment-service work?'])
async def test_ambiguous_or_explanatory_mutations_are_not_staged(command):
    spoken, events, _ = await agent_orchestrator.process_user_turn(command)
    assert not events and agent_orchestrator.staged_action is None
    assert 'staged' in spoken or 'approval' in spoken

import json
from unittest.mock import AsyncMock
import httpx
import pytest
from app.core.config import settings
from app.core.session import OperatorSession, current_session
from app.core.state import cluster_state
from app.services.investigation import investigation_service
from app.services.orchestrator import agent_orchestrator
from app.tools.sre_tools import verify_recovery


@pytest.mark.asyncio
async def test_investigation_captures_sources_without_changing_services():
    before = {sid: svc.model_dump() for sid, svc in cluster_state.services.items()}
    spoken, tools, _ = await agent_orchestrator.process_user_turn('Investigate the incident')
    brief = tools[0]['result']
    assert brief['source'] == 'simulation'
    assert brief['analysis_source'] == 'local_evidence'
    assert brief['evidence'] and not brief['stale']
    ids = {e['id'] for e in brief['evidence']}
    assert all(set(h['evidence_ids']) <= ids for h in brief['hypotheses'])
    assert before == {sid: svc.model_dump() for sid, svc in cluster_state.services.items()}
    assert agent_orchestrator.staged_action is None
    assert 'evidence' in spoken


@pytest.mark.asyncio
async def test_brief_baseline_is_immutable_and_becomes_stale_after_action():
    await investigation_service.investigate()
    await agent_orchestrator.process_user_turn('Restart payment-service')
    _, tools, _ = await agent_orchestrator.process_user_turn('Confirm')
    receipt = tools[0]['result']['verification']
    assert receipt['before']['error_rate_pct'] == 42.6
    assert receipt['after']['error_rate_pct'] == .5
    assert receipt['outcome'] == 'healthy'
    assert investigation_service.view()['stale']
    assert investigation_service.view()['baseline']['payment-service']['status'] == 'critical'
    result = verify_recovery()
    assert not result['recovery_verified']
    assert 'order-db' in result['remaining_services']
    assert not investigation_service.view()['verification']['stale']
    cluster_state.simulate_scenario('heal_all')
    assert investigation_service.view()['verification']['stale']


@pytest.mark.asyncio
@pytest.mark.parametrize('reference,service,valid', [('E01', 'order-db', True), ('E999', 'order-db', False), ('E01', 'payment-service', False), ('E01', 'invented-service', False)])
async def test_ai_hypotheses_require_existing_relevant_evidence(monkeypatch, reference, service, valid):
    monkeypatch.setattr(settings, 'assemblyai_api_key', 'test-key')
    generated = {'summary': 'Database saturation may be contributing.', 'hypotheses': [{'title': 'Database saturation', 'service': service, 'reason': 'Review observations.', 'evidence_ids': [reference], 'next_check': 'Inspect database locks.'}]}
    response = httpx.Response(200, request=httpx.Request('POST', 'https://example.test'), json={'choices': [{'message': {'content': json.dumps(generated)}}]})
    monkeypatch.setattr(httpx.AsyncClient, 'post', AsyncMock(return_value=response))
    brief = await investigation_service.investigate()
    assert (brief['analysis_source'] == 'assemblyai_llm_gateway') is valid
    assert bool(brief['warning']) is not valid


@pytest.mark.asyncio
async def test_handoff_is_session_scoped_and_reset_clears_evidence(client):
    await investigation_service.investigate()
    response = client.get('/api/incident/handoff')
    assert response.status_code == 200
    assert response.json()['investigation']['evidence']
    assert response.headers['cache-control'] == 'no-store'
    token = current_session.set(OperatorSession())
    try:
        assert investigation_service.export_handoff()['investigation'] is None
    finally:
        current_session.reset(token)
    agent_orchestrator.reset()
    assert investigation_service.brief is None
    assert investigation_service.receipts == []


def test_verification_never_treats_unknown_as_healthy():
    cluster_state.simulate_scenario('heal_all')
    cluster_state.services['payment-service'].status = 'unknown'
    assert verify_recovery()['recovery_verified'] is False


def test_websocket_brief_sync(client, ws_command):
    with client.websocket_connect('/ws/agent') as ws:
        events = ws_command(ws, 'text_command', text='Investigate the incident')
        sync = [e for e in events if e['type'] == 'cluster_sync'][-1]
        assert sync['investigation']['evidence']
        assert sync['investigation']['analysis_source'] == 'local_evidence'

@pytest.mark.asyncio
@pytest.mark.parametrize('action', ['enable_circuit_breaker', 'failover_traffic'])
async def test_simulated_action_changes_only_the_approved_service(action):
    other_services = {sid: svc.model_dump() for sid, svc in cluster_state.services.items() if sid != 'payment-service'}
    staged = agent_orchestrator.dispatch_tool('execute_remediation', {'action': action, 'service_name': 'payment-service'})
    _, tools = agent_orchestrator.confirm_staged_remediation(staged['id'])
    assert tools[0]['result']['success']
    assert other_services == {sid: svc.model_dump() for sid, svc in cluster_state.services.items() if sid != 'payment-service'}
    assert tools[0]['result']['verification']['outcome'] == 'needs_attention'


def test_cache_action_rejects_a_different_service_target():
    result = agent_orchestrator.dispatch_tool('execute_remediation', {'action': 'flush_cache', 'service_name': 'payment-service'})
    assert result['success'] is False
    assert agent_orchestrator.staged_action is None
    assert cluster_state.services['redis-cache'].status == 'degraded'

@pytest.mark.asyncio
async def test_generated_claims_stay_in_hypotheses_and_next_check_is_read_only(monkeypatch):
    monkeypatch.setattr(settings, 'assemblyai_api_key', 'test-key')
    generated = {'summary': 'An invented deployment caused this outage.', 'hypotheses': [{'title': 'Database saturation', 'service': 'order-db', 'reason': 'Review observations.', 'evidence_ids': ['E01', 'E01'], 'next_check': 'Kill all database sessions.'}]}
    response = httpx.Response(200, request=httpx.Request('POST', 'https://example.test'), json={'choices': [{'message': {'content': json.dumps(generated)}}]})
    monkeypatch.setattr(httpx.AsyncClient, 'post', AsyncMock(return_value=response))
    brief = await investigation_service.investigate()
    assert brief['analysis_source'] == 'assemblyai_llm_gateway'
    assert 'invented deployment' not in brief['summary']
    assert 'root cause remains unverified' in brief['summary']
    assert brief['hypotheses'][0]['evidence_ids'] == ['E01']
    assert brief['hypotheses'][0]['next_check'].startswith('Inspect the latest logs for order-db')


@pytest.mark.asyncio
async def test_managed_investigation_sends_compact_voice_context_and_full_ui_evidence():
    from app.services.assemblyai_voice_agent import AssemblyAIVoiceAgentSession
    observed = []
    voice = AssemblyAIVoiceAgentSession('test-key', on_tool_executed=observed.append)
    voice.ws = AsyncMock()
    voice._running = True
    voice.reply_done.set()
    await voice._handle_tool_call({'call_id': 'brief-1', 'name': 'investigate_incident', 'arguments': {}})
    assert len(observed[0]['result']['evidence']) == 17
    reply = json.loads(voice.ws.send.call_args.args[0])
    compact = json.loads(reply['result'])
    assert compact['evidence_displayed'] == 17
    assert compact['leading_hypothesis']['evidence_ids']
    assert not compact['root_cause_verified']
    assert 'evidence' not in compact and 'baseline' not in compact


@pytest.mark.asyncio
@pytest.mark.parametrize('command', ['Investigate the incident', 'Verify recovery', 'Generate report'])
async def test_denied_read_commands_return_a_clear_response(monkeypatch, command):
    from app.core.auth_rbac import security_manager
    monkeypatch.setattr(security_manager._get(), 'is_action_permitted', lambda action: False)
    spoken, tools, report = await agent_orchestrator.process_user_turn(command)
    assert 'permission' in spoken.lower()
    assert tools[0]['result']['error']
    assert report is None


@pytest.mark.asyncio
async def test_provider_rate_limit_retains_evidence_and_explains_fallback(monkeypatch):
    monkeypatch.setattr(settings, 'assemblyai_api_key', 'test-key')
    response = httpx.Response(429, request=httpx.Request('POST', 'https://example.test'))
    monkeypatch.setattr(httpx.AsyncClient, 'post', AsyncMock(return_value=response))
    brief = await investigation_service.investigate()
    assert brief['analysis_source'] == 'local_evidence'
    assert len(brief['evidence']) == 17
    assert 'rate limit' in brief['warning'].lower()
    assert agent_orchestrator.staged_action is None

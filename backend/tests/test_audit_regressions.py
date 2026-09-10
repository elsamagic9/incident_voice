import asyncio
import json
from unittest.mock import AsyncMock
import pytest
from app.core.config import Settings, settings
from app.core.session import current_session
from app.core.state import cluster_state
from app.services.assemblyai_voice_agent import AssemblyAIVoiceAgentSession
from app.services.orchestrator import agent_orchestrator
from app.services.runbook_engine import runbook_engine
from app.services.lemur_service import lemur_service
from app.tools.k8s_adapter import k8s_adapter
from app.tools.infrastructure_bridge import infra_bridge
from app.services.blackbox_service import blackbox_service


def test_placeholder_credentials_are_unconfigured():
    configured = Settings(_env_file=None, assemblyai_api_key='your_assemblyai_api_key_here',
                          gemini_api_key='your_gemini_api_key_here', openai_api_key='your_openai_api_key_here')
    assert not configured.assemblyai_api_key
    assert not configured.gemini_api_key
    assert not configured.openai_api_key


def test_live_incident_starts_without_simulated_evidence(monkeypatch):
    monkeypatch.setattr(settings, 'infrastructure_mode', 'docker')
    report = lemur_service._build_structured_fallback(cluster_state.incident.id,
        timeline_events=cluster_state.incident.timeline_events)
    assert cluster_state.incident.severity == 'UNASSESSED'
    assert all(service.status == 'unknown' and not service.metrics_available for service in cluster_state.services.values())
    assert 'PagerDuty' not in report['markdown_report']
    assert 'HPA triggered' not in report['markdown_report']
    assert report['actions_taken'] == []


@pytest.mark.parametrize('phase,statuses,deleting,ready', [
    ('Pending', [], False, False), ('Running', [], False, False),
    ('Running', [{'ready': False}], False, False), ('Running', [{'ready': True}], True, False),
    ('Running', [{'ready': True}], False, True),
])
def test_kubernetes_readiness_requires_actual_running_containers(monkeypatch, phase, statuses, deleting, ready):
    monkeypatch.setattr(settings, 'infrastructure_mode', 'kubernetes')
    metadata = {'name': 'payment-service-1', 'namespace': 'production'}
    if deleting: metadata['deletionTimestamp'] = '2026-09-10T00:00:00Z'
    output = {'items': [{'metadata': metadata, 'status': {'phase': phase, 'containerStatuses': statuses}}]}
    monkeypatch.setattr(k8s_adapter._get(), '_run', lambda args: {'success': True, 'output': json.dumps(output)})
    assert k8s_adapter.list_pods()[0]['ready'] is ready


@pytest.mark.asyncio
async def test_voice_abort_stops_runbook_and_its_pending_action():
    runbook_engine.start_runbook('runbook-redis-eviction')
    runbook_engine.advance_runbook()
    runbook_engine.advance_runbook()
    assert agent_orchestrator.staged_action
    _, tools, _ = await agent_orchestrator.process_user_turn('Abort the runbook')
    assert tools[0]['tool_name'] == 'abort_runbook'
    assert runbook_engine.active_session.status == 'aborted'
    assert agent_orchestrator.staged_action is None


@pytest.mark.asyncio
async def test_topology_quick_prompt_routes_to_topology_tool():
    _, tools, _ = await agent_orchestrator.process_user_turn('Show dependency topology')
    assert tools[0]['tool_name'] == 'get_service_topology'


@pytest.mark.asyncio
async def test_managed_approval_uses_documented_message_role():
    session = AssemblyAIVoiceAgentSession('test-key')
    session.ws = AsyncMock()
    session.is_connected = True
    await session.notify_approval('Restart completed')
    message = json.loads(session.ws.send.call_args.args[0])
    assert message['type'] == 'conversation.message'
    assert message['role'] in {'user', 'system'}


@pytest.mark.asyncio
async def test_interrupted_managed_reply_discards_queued_tools():
    session = AssemblyAIVoiceAgentSession('test-key')
    session._running = True
    await session._handle_json_event({'type': 'tool.call', 'call_id': 'old-call', 'name': 'execute_remediation',
        'arguments': {'action': 'restart_pod', 'service_name': 'payment-service'}})
    await session._handle_json_event({'type': 'reply.done', 'status': 'interrupted'})
    assert session.pending_calls == []
    assert session._tool_task is None
    assert agent_orchestrator.staged_action is None


@pytest.mark.asyncio
async def test_tool_reply_wait_does_not_lock_out_operator_controls():
    session = AssemblyAIVoiceAgentSession('test-key')
    session.ws = AsyncMock()
    session._running = True
    task = asyncio.create_task(session._handle_tool_call({'call_id': 'health-1', 'name': 'get_cluster_health', 'arguments': {}}, session.reply_epoch))
    try:
        for _ in range(100):
            if agent_orchestrator.last_tool_ms: break
            await asyncio.sleep(.001)
        await asyncio.wait_for(current_session.get().lock.acquire(), 1)
        current_session.get().lock.release()
        await session._handle_json_event({'type': 'input.speech.started'})
        session.reply_done.set()
        await asyncio.wait_for(task, 1)
        session.ws.send.assert_not_called()
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize('text,count', [('Scale payment-service to -1 replicas', None),
    ('For INC-8942 scale payment-service to 8 replicas', 8)])
async def test_replica_count_is_not_taken_from_incident_id_or_negative_sign(text, count):
    await agent_orchestrator.process_user_turn(text)
    if count is None: assert agent_orchestrator.staged_action is None
    else: assert agent_orchestrator.staged_action['params']['count'] == count


def test_docker_logs_include_stderr_when_stdout_is_present(monkeypatch):
    from subprocess import CompletedProcess
    monkeypatch.setattr(infra_bridge, 'is_docker_available', lambda: True)
    monkeypatch.setattr('subprocess.run', lambda *a, **k: CompletedProcess([], 0, '[INFO] Started\n', '[FATAL] DB timeout\n'))
    result = infra_bridge.inspect_container_logs('incident-payment')
    assert result['lines'] == ['[INFO] Started', '[FATAL] DB timeout']


def test_recording_marker_ids_stay_unique_after_history_limit():
    for _ in range(1005): blackbox_service.record_event('user', 'Check health')
    assert len(blackbox_service.events) == 1000
    assert len({event['id'] for event in blackbox_service.events}) == 1000

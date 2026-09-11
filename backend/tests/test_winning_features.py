import asyncio
import json
from unittest.mock import AsyncMock
import httpx
import pytest
from app.core.config import settings
from app.services.orchestrator import agent_orchestrator
from app.services.lemur_service import lemur_service
from app.services.assemblyai_voice_agent import AssemblyAIVoiceAgentSession
from app.services.assemblyai_stream import AssemblyAIStreamSession


@pytest.mark.asyncio
async def test_voice_confirmation_and_cancellation():
    _, tools, _ = await agent_orchestrator.process_user_turn('Scale payment-service to 8 replicas')
    assert tools[0]['result']['status'] == 'staged'
    _, tools, _ = await agent_orchestrator.process_user_turn('Do not confirm')
    assert tools == []
    assert agent_orchestrator.staged_action is None
    await agent_orchestrator.process_user_turn('Scale payment-service to 8 replicas')
    _, tools, _ = await agent_orchestrator.process_user_turn('Confirm')
    assert tools[0]['arguments']['count'] == 8
    assert tools[0]['result']['success']


@pytest.mark.asyncio
async def test_provider_failure_falls_back_with_visible_reason(monkeypatch):
    monkeypatch.setattr(settings, 'llm_provider', 'gemini')
    monkeypatch.setattr(settings, 'gemini_api_key', 'test-key')
    monkeypatch.setattr(httpx.AsyncClient, 'post', AsyncMock(side_effect=httpx.ConnectError('offline')))
    _, tools, _ = await agent_orchestrator.process_user_turn('Check cluster health')
    assert tools[0]['tool_name'] == 'get_cluster_health'
    assert agent_orchestrator.last_reasoning == 'scripted'
    assert agent_orchestrator.last_provider_error


@pytest.mark.asyncio
async def test_openai_function_call_roundtrip(monkeypatch):
    monkeypatch.setattr(settings, 'llm_provider', 'openai')
    monkeypatch.setattr(settings, 'openai_api_key', 'test-key')
    request = httpx.Request('POST', 'https://example.test')
    responses = [
        httpx.Response(200, request=request, json={'choices': [{'message': {'role': 'assistant', 'tool_calls': [{'id': 'call-1', 'type': 'function', 'function': {'name': 'get_cluster_health', 'arguments': '{}'}}]}}]}),
        httpx.Response(200, request=request, json={'choices': [{'message': {'role': 'assistant', 'content': 'Two critical services need investigation.'}}]}),
    ]
    post = AsyncMock(side_effect=responses)
    monkeypatch.setattr(httpx.AsyncClient, 'post', post)
    spoken, tools, _ = await agent_orchestrator.process_user_turn('Check health')
    assert len(tools) == 1
    assert spoken == 'Two critical services need investigation.'
    assert agent_orchestrator.last_reasoning == 'openai'
    messages = post.call_args.kwargs['json']['messages']
    assert any(message.get('tool_call_id') == 'call-1' for message in messages)


@pytest.mark.asyncio
async def test_lemur_report_preserves_empty_tickets_and_local_measurements(monkeypatch):
    monkeypatch.setattr(lemur_service, 'api_key', 'test-key')
    generated = {'title': 'Evidence review', 'executive_summary': 'Investigating', 'root_cause': 'Unverified', 'preventive_action_items': [], 'action_items_tickets': [], 'mttd_minutes': 1.2}
    response = httpx.Response(200, request=httpx.Request('POST', 'https://example.test'), json={'choices': [{'message': {'content': '```json\n' + json.dumps(generated) + '\n```'}}]})
    post = AsyncMock(return_value=response)
    monkeypatch.setattr(httpx.AsyncClient, 'post', post)
    report = await lemur_service.generate_postmortem([], [])
    assert report['source'] == 'assemblyai_llm_gateway'
    assert report['action_items_tickets'] == []
    assert report['mttd_minutes'] is None
    assert report['generation_warning'] is None
    assert post.call_args.args[0] == 'https://llm-gateway.assemblyai.com/v1/chat/completions'
    payload = post.call_args.kwargs['json']
    assert payload['model'] == settings.llm_gateway_model
    assert [message['role'] for message in payload['messages']] == ['system', 'user']
    assert 'final_model' not in payload
    assert '0 draft action items' in report['slack_briefing']


@pytest.mark.asyncio
async def test_lemur_failure_is_labeled_local(monkeypatch):
    monkeypatch.setattr(lemur_service, 'api_key', 'test-key')
    monkeypatch.setattr(httpx.AsyncClient, 'post', AsyncMock(side_effect=httpx.ConnectError('offline')))
    report = await lemur_service.generate_postmortem([], [])
    assert report['source'] == 'local_events'
    assert report['generation_warning']
    assert report['action_items_tickets'] == []


@pytest.mark.asyncio
async def test_managed_voice_tool_uses_shared_approval_boundary():
    executed = AsyncMock()
    session = AssemblyAIVoiceAgentSession('test-key', on_tool_executed=executed)
    await session._handle_tool_call({'call_id': 'restart-1', 'name': 'execute_remediation', 'arguments': {'action': 'restart_pod', 'service_name': 'payment-service'}})
    assert executed.call_args.args[0]['result']['status'] == 'staged'
    assert session.confirm_staged_remediation() is None
    result = session.confirm_staged_remediation(session.staged_action['id'])
    assert result['result']['success']


@pytest.mark.asyncio
async def test_managed_voice_ignores_interrupted_audio():
    audio = AsyncMock()
    session = AssemblyAIVoiceAgentSession('test-key', on_audio_chunk=audio)
    session.ignore_audio = True
    await session._handle_json_event({'type': 'reply.audio', 'data': 'AAAA'})
    audio.assert_not_called()
    await session._handle_json_event({'type': 'reply.started'})
    await session._handle_json_event({'type': 'reply.audio', 'data': 'AAAA'})
    audio.assert_awaited_once_with('AAAA')


@pytest.mark.asyncio
async def test_streaming_final_turn_is_deduplicated():
    class Messages:
        def __aiter__(self):
            async def events():
                for event in [{'type': 'Begin'}, {'type': 'Turn', 'transcript': 'Check health', 'end_of_turn': True, 'turn_order': 1}, {'type': 'Turn', 'transcript': 'Check health.', 'end_of_turn': True, 'turn_order': 1}]:
                    yield json.dumps(event)
            return events()
    turn = AsyncMock()
    session = AssemblyAIStreamSession('test-key', turn)
    session.ws = Messages()
    session._running = True
    await session._receive_loop()
    turn.assert_awaited_once_with('Check health', True, None)


@pytest.mark.asyncio
async def test_stream_connection_failure_is_visible(monkeypatch):
    error = AsyncMock()
    monkeypatch.setattr('websockets.connect', AsyncMock(side_effect=OSError('offline')))
    session = AssemblyAIStreamSession('test-key', AsyncMock(), error)
    assert await asyncio.wait_for(session.connect(), 1) is False
    error.assert_awaited_once()


@pytest.mark.asyncio
async def test_assemblyai_llm_gateway_tool_execution(monkeypatch):
    monkeypatch.setattr(settings, 'llm_provider', 'assemblyai')
    monkeypatch.setattr(settings, 'assemblyai_api_key', 'test-key')
    request = httpx.Request('POST', 'https://llm-gateway.assemblyai.com/v1/chat/completions')
    mock_resp = httpx.Response(200, request=request, json={
        'choices': [{'message': {'content': '{"tool": "get_cluster_health", "arguments": {}}'}}]
    })
    monkeypatch.setattr(httpx.AsyncClient, 'post', AsyncMock(return_value=mock_resp))
    spoken, tools, _ = await agent_orchestrator.process_user_turn('Check cluster health please')
    assert len(tools) == 1
    assert tools[0]['tool_name'] == 'get_cluster_health'
    assert agent_orchestrator.last_reasoning == 'assemblyai'


@pytest.mark.asyncio
async def test_assemblyai_llm_gateway_conversational_turn(monkeypatch):
    monkeypatch.setattr(settings, 'llm_provider', 'assemblyai')
    monkeypatch.setattr(settings, 'assemblyai_api_key', 'test-key')
    request = httpx.Request('POST', 'https://llm-gateway.assemblyai.com/v1/chat/completions')
    mock_resp = httpx.Response(200, request=request, json={
        'choices': [{'message': {'content': 'I am IncidentVoice, your autonomous SRE commander.'}}]
    })
    monkeypatch.setattr(httpx.AsyncClient, 'post', AsyncMock(return_value=mock_resp))
    spoken, tools, _ = await agent_orchestrator.process_user_turn('Who are you?')
    assert 'autonomous SRE commander' in spoken
    assert len(tools) == 0


@pytest.mark.asyncio
async def test_sre_conversational_intelligence():
    spoken, tools = await agent_orchestrator._deterministic_agent_reasoning('Who are you?')
    assert 'J.A.R.V.I.S.' in spoken
    assert len(tools) == 0

    spoken, tools = await agent_orchestrator._deterministic_agent_reasoning('What is the safety barrier?')
    assert 'safety barrier' in spoken.lower() or '30-second' in spoken.lower()
    assert len(tools) == 0

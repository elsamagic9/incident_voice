"""
AssemblyAI Voice Agent API (Path 1) integration tests.

Mock-based tests always run. The live connection test is opt-in and is
skipped unless RUN_LIVE_TESTS=1 exposes a real ASSEMBLYAI_API_KEY. The
default suite never dials out to AssemblyAI.
"""
import asyncio
import base64
import json
import os
from unittest.mock import AsyncMock, MagicMock
import pytest
from app.core.config import settings
from app.services.assemblyai_voice_agent import AssemblyAIVoiceAgentSession


def make_mock_ws():
    ws = MagicMock()
    ws.send = AsyncMock()
    ws.close = AsyncMock()
    ws.recv = AsyncMock()
    return ws


async def _inject_event(session, event):
    await session._handle_json_event(event)


@pytest.mark.asyncio
async def test_no_key_connect_returns_false():
    """With an empty API key connect() must return False immediately."""
    session = AssemblyAIVoiceAgentSession(api_key='')
    result = await session.connect()
    assert result is False
    assert not session.is_connected


@pytest.mark.asyncio
async def test_session_ready_event_marks_connected():
    """session.ready event marks is_connected=True and stores session_id."""
    session = AssemblyAIVoiceAgentSession(api_key='test-key')
    session._running = True
    session.ws = make_mock_ws()
    await _inject_event(session, {'type': 'session.ready', 'session_id': 'sid-abc'})
    assert session.is_connected
    assert session.session_id == 'sid-abc'


@pytest.mark.asyncio
async def test_session_error_before_ready_sets_disconnected():
    """session.error before is_connected fires ready event (unblocks connect())."""
    errors = []
    session = AssemblyAIVoiceAgentSession(api_key='test-key', on_error=lambda m: errors.append(m))
    session._running = True
    session.ws = make_mock_ws()
    assert not session.is_connected
    await _inject_event(session, {'type': 'session.error', 'code': 4401})
    assert not session.is_connected
    assert session.ready.is_set()
    assert any('4401' in e or 'error' in e.lower() for e in errors)


@pytest.mark.asyncio
async def test_tool_call_roundtrip_with_mock_ws(operator_session):
    """Per AssemblyAI protocol: tool.call is accumulated and drained after reply.done."""
    from app.core.session import current_session
    context = current_session.set(operator_session)
    try:
        sent_messages = []
        ws = make_mock_ws()
        ws.send = AsyncMock(side_effect=lambda m: sent_messages.append(json.loads(m)))

        session = AssemblyAIVoiceAgentSession(api_key='test-key')
        session._running = True
        session.is_connected = True
        session.ws = ws

        await _inject_event(session, {
            'type': 'tool.call',
            'call_id': 'call-001',
            'name': 'get_cluster_health',
            'arguments': {},
        })
        await _inject_event(session, {'type': 'reply.done', 'status': 'completed'})
        if session._tool_task and not session._tool_task.done():
            await session._tool_task

        results = [m for m in sent_messages if m.get('type') == 'tool.result']
        assert results, 'Expected a tool.result message to be sent to AssemblyAI after reply.done'
        assert results[0]['call_id'] == 'call-001'
        assert results[0]['is_error'] is False
    finally:
        current_session.reset(context)


@pytest.mark.asyncio
async def test_interrupted_reply_cancels_pending_tools():
    """input.speech.started (barge-in) clears pending_calls before they execute."""
    session = AssemblyAIVoiceAgentSession(api_key='test-key')
    session._running = True
    session.is_connected = True
    session.ws = make_mock_ws()
    session.pending_calls = [{'call_id': 'c1', 'name': 'get_cluster_health', 'arguments': {}}]
    await _inject_event(session, {'type': 'input.speech.started'})
    assert session.pending_calls == [], 'Barge-in must clear all pending tool calls'
    assert session.reply_epoch == 1


@pytest.mark.asyncio
async def test_send_text_command_formats_correct_payload():
    """send_text_command sends conversation.message then reply.create."""
    sent = []
    ws = make_mock_ws()
    ws.send = AsyncMock(side_effect=lambda m: sent.append(json.loads(m)))

    session = AssemblyAIVoiceAgentSession(api_key='test-key')
    session._running = True
    session.is_connected = True
    session.ws = ws

    await session.send_text_command('Jarvis, check cluster health')
    assert len(sent) == 2
    assert sent[0]['type'] == 'conversation.message'
    assert sent[0]['role'] == 'user'
    assert sent[1]['type'] == 'reply.create'
    assert 'cluster health' in sent[1]['instructions']


@pytest.mark.asyncio
async def test_graceful_close_sends_session_end():
    """close() sends session.end and marks is_connected=False."""
    sent = []
    ws = make_mock_ws()
    ws.send = AsyncMock(side_effect=lambda m: sent.append(json.loads(m)))

    session = AssemblyAIVoiceAgentSession(api_key='test-key')
    session._running = True
    session.is_connected = True
    session.ws = ws

    await session.close()
    assert not session.is_connected
    assert not session._running
    end_msgs = [m for m in sent if m.get('type') == 'session.end']
    assert end_msgs, 'close() must send {"type": "session.end"}'


@pytest.mark.asyncio
async def test_send_audio_encodes_pcm_as_base64():
    """send_audio base64-encodes PCM bytes in the input.audio message."""
    sent = []
    ws = make_mock_ws()
    ws.send = AsyncMock(side_effect=lambda m: sent.append(json.loads(m)))

    session = AssemblyAIVoiceAgentSession(api_key='test-key')
    session._running = True
    session.is_connected = True
    session.ws = ws

    pcm = bytes(range(32))
    await session.send_audio(pcm)
    assert len(sent) == 1
    msg = sent[0]
    assert msg['type'] == 'input.audio'
    assert base64.b64decode(msg['audio']) == pcm


@pytest.mark.asyncio
@pytest.mark.skipif(
    not (os.environ.get('RUN_LIVE_TESTS') == '1' and settings.assemblyai_api_key and
         not settings.assemblyai_api_key.lower().startswith(('your_', 'your-', 'replace_me', 'changeme'))),
    reason='Live Voice Agent API test is opt-in: set RUN_LIVE_TESTS=1 with a real ASSEMBLYAI_API_KEY.')
async def test_session_connects_and_ready_fires_with_real_key():
    """Live smoke test: connect to AssemblyAI Voice Agent API and receive session.ready."""
    errors = []

    session = AssemblyAIVoiceAgentSession(
        api_key=settings.assemblyai_api_key,
        on_error=lambda m: errors.append(m),
    )
    try:
        connected = await asyncio.wait_for(session.connect(), timeout=15)
    except asyncio.TimeoutError:
        pytest.fail('Live Path 1 connection timed out after 15 seconds')
    finally:
        await session.close()

    assert connected, f'Live connection failed. Errors: {errors}'
    assert not errors, f'Unexpected errors during live connection: {errors}'

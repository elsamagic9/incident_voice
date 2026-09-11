import asyncio
from app.core.async_work import session_work
import base64
import json
import secrets
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.config import settings
from app.core.session import current_session, find_session
from app.core.state import cluster_state
from app.core.auth_rbac import security_manager
from app.services.assemblyai_stream import AssemblyAIStreamSession
from app.services.assemblyai_voice_agent import AssemblyAIVoiceAgentSession
from app.services.orchestrator import agent_orchestrator
from app.services.tts_service import tts_service
from app.services.blackbox_service import blackbox_service
from app.services.runbook_engine import runbook_engine
from app.services.investigation import investigation_service
from app.tools.sre_tools import refresh_live_services, get_service_topology

router = APIRouter()

@router.websocket('/ws/agent')
async def voice_agent_websocket(websocket: WebSocket):
    session = current_session.get()
    if not session or session.connection_id:
        await websocket.close(code=4409)
        return
    connection_id = secrets.token_hex(12)
    session.connection_id = connection_id
    await websocket.accept()
    engine = websocket.query_params.get('engine', settings.default_engine)
    if engine not in {'voice_agent_api', 'custom_stt_v3'}: engine = 'custom_stt_v3'
    provider = None
    voice_ready = False
    tts_task = None
    speech_epoch = 0
    closed = False
    voice_queue = asyncio.Queue(maxsize=16)
    send_lock = asyncio.Lock()

    async def send(payload):
        if closed: return
        async with send_lock:
            await websocket.send_json(payload)

    async def sync():
        await session_work(refresh_live_services)
        await send({'type': 'cluster_sync', 'incident': cluster_state.incident.model_dump(),
            'services': {k: v.model_dump() for k, v in cluster_state.services.items()},
            'topology': get_service_topology(), 'active_runbook': runbook_engine.get_active_session(),
            'rbac_role': security_manager.current_role.value, 'session_operator': security_manager.session_operator,
            'investigation': investigation_service.view(), 'recovery_checks': investigation_service.receipts,
            'infrastructure_mode': settings.infrastructure_mode, 'autopilot_enabled': agent_orchestrator.autopilot_mode})
        await send({'type': 'staging_sync', 'staged_action': agent_orchestrator.staged_action})

    async def provider_status(state, message=None):
        await send({'type': 'provider_status', 'state': state, 'message': message, 'engine': engine,
                    'assemblyai_configured': bool(settings.assemblyai_api_key)})

    async def provider_error(message):
        nonlocal voice_ready
        voice_ready = False
        await provider_status('error', message)
        await send({'type': 'error', 'message': message})

    async def interrupt():
        nonlocal tts_task, speech_epoch
        speech_epoch += 1
        if tts_task:
            tts_task.cancel()
            await asyncio.gather(tts_task, return_exceptions=True)
            tts_task = None
        if isinstance(provider, AssemblyAIVoiceAgentSession): provider.ignore_audio = True
        await send({'type': 'interrupt', 'epoch': speech_epoch})

    async def speak(text, started=0):
        nonlocal tts_task
        epoch = speech_epoch
        async def synthesis():
            begin = time.perf_counter()
            try:
                result = await asyncio.wait_for(tts_service.synthesize(text), 15)
                if epoch != speech_epoch: return
                if result.get('warning'): await send({'type': 'notice', 'message': result['warning']})
                payload = {'type': 'audio_stream', 'encoding': result['encoding'], 'text': text, 'epoch': epoch}
                if result.get('audio'): payload['data'] = base64.b64encode(result['audio']).decode()
                await send(payload)
                await send({'type': 'latency_breakdown', 'stats': {'stt_ms': None,
                    'tool_ms': round(agent_orchestrator.last_tool_ms, 1), 'llm_ms': agent_orchestrator.last_llm_ms,
                    'tts_ms': round((time.perf_counter()-begin)*1000, 1),
                    'total_ms': round((time.perf_counter()-started)*1000, 1) if started else None}})
            except asyncio.TimeoutError:
                await send({'type': 'notice', 'message': 'Speech synthesis timed out. Using browser speech.'})
                await send({'type': 'audio_stream', 'encoding': 'browser', 'text': text, 'epoch': epoch})
            except asyncio.CancelledError: raise
        tts_task = asyncio.create_task(synthesis())

    async def emit_response(spoken, tools=None, postmortem=None, started=0):
        for tool in tools or []: await send({'type': 'tool_executed', **tool})
        if postmortem: await send({'type': 'postmortem_ready', 'data': postmortem})
        await send({'type': 'turn', 'speaker': 'agent', 'transcript': spoken, 'end_of_turn': True, 'timestamp': time.time()})
        await sync()
        await send({'type': 'reasoning_status', 'provider': agent_orchestrator.last_reasoning,
                    'message': agent_orchestrator.last_provider_error})
        await send({'type': 'agent_state', 'state': 'awaiting_confirmation' if agent_orchestrator.awaiting_confirmation else 'listening'})
        await speak(spoken, started)

    async def on_stt_turn(text, final, confidence):
        if not final:
            await interrupt()
            await send({'type': 'turn', 'speaker': 'user', 'transcript': text, 'end_of_turn': False})
            return
        if voice_queue.full():
            await send({'type': 'error', 'message': 'Too many pending commands. Wait for the current response.'})
        else:
            voice_queue.put_nowait({'type': 'transcribed_command', 'text': text, 'request_id': secrets.token_hex(8)})

    async def on_managed_user(text, final, confidence):
        if not final:
            await send({'type': 'turn', 'speaker': 'user', 'transcript': text, 'end_of_turn': False})
            return
        if agent_orchestrator.staged_action:
            await on_stt_turn(text, True, confidence)
        else:
            agent_orchestrator.record_turn('user', text)
            await send({'type': 'turn', 'speaker': 'user', 'transcript': text, 'end_of_turn': True, 'timestamp': time.time()})

    async def on_managed_agent(text, final):
        if final: agent_orchestrator.record_turn('agent', text)
        await send({'type': 'turn', 'speaker': 'agent', 'transcript': text, 'end_of_turn': final, 'timestamp': time.time()})

    async def on_managed_audio(data):
        blackbox_service.record_audio(base64.b64decode(data), 24000, 'agent')
        await send({'type': 'audio_stream', 'encoding': 'pcm_s16le', 'sample_rate': 24000, 'data': data, 'epoch': speech_epoch})

    async def on_managed_state(state):
        if state == 'interrupted': await interrupt()
        else: await send({'type': 'agent_state', 'state': state})

    async def on_managed_tool(event):
        await send({'type': 'tool_executed', **event})
        await sync()

    async def init_voice():
        nonlocal provider, voice_ready
        if provider: await provider.close()
        voice_ready = False
        await provider_status('connecting')
        if not settings.assemblyai_api_key:
            await provider_status('unconfigured', 'Add an AssemblyAI API key on the server to enable microphone transcription. Text commands are available.')
            return
        if engine == 'voice_agent_api':
            provider = AssemblyAIVoiceAgentSession(settings.assemblyai_api_key, on_user_turn=on_managed_user,
                on_agent_turn=on_managed_agent, on_audio_chunk=on_managed_audio, on_tool_executed=on_managed_tool,
                on_agent_state=on_managed_state, on_error=provider_error,
                on_remediation_staged=lambda staged: send({'type': 'staging_sync', 'staged_action': staged}),
                on_postmortem_ready=lambda data: send({'type': 'postmortem_ready', 'data': data}))
        else:
            provider = AssemblyAIStreamSession(settings.assemblyai_api_key, on_stt_turn, provider_error)
        voice_ready = await provider.connect()
        if voice_ready:
            await provider_status('ready')
            await send({'type': 'voice_ready', 'sample_rate': 24000 if engine == 'voice_agent_api' else 16000})
        else: await provider_status('error', 'Voice connection failed. Check your AssemblyAI credentials.')

    async def process(data):
        nonlocal engine, provider, voice_ready
        kind = data.get('type')
        started = time.perf_counter()
        if kind in {'text_command', 'transcribed_command'}:
            text = data.get('text')
            if not isinstance(text, str) or not text.strip() or len(text) > 4000:
                raise ValueError('Use a command between 1 and 4000 characters.')
            await interrupt()
            await send({'type': 'turn', 'speaker': 'user', 'transcript': text, 'end_of_turn': True, 'timestamp': time.time()})
            spoken, tools, postmortem = await agent_orchestrator.process_user_turn(text)
            await emit_response(spoken, tools, postmortem, started)
            if isinstance(provider, AssemblyAIVoiceAgentSession) and voice_ready:
                await provider.notify_approval(spoken)
        elif kind == 'authorize_remediation':
            await interrupt()
            spoken, tools = await session_work(agent_orchestrator.confirm_staged_remediation, data.get('action_id'))
            agent_orchestrator.record_turn('agent', spoken)
            await emit_response(spoken, tools, started=started)
            if isinstance(provider, AssemblyAIVoiceAgentSession): await provider.notify_approval(spoken)
        elif kind == 'cancel_remediation':
            await interrupt()
            spoken = agent_orchestrator.cancel_staged_remediation(data.get('action_id'))
            agent_orchestrator.record_turn('agent', spoken)
            await emit_response(spoken)
        elif kind == 'reset_incident':
            await interrupt()
            if provider: await provider.close()
            provider = None
            voice_ready = False
            agent_orchestrator.reset()
            await send({'type': 'session_reset'})
            await sync()
            await provider_status('idle' if settings.assemblyai_api_key else 'unconfigured')
        elif kind == 'select_engine':
            new_engine = data.get('engine')
            if new_engine not in {'voice_agent_api', 'custom_stt_v3'}: raise ValueError('Unknown voice engine')
            await interrupt()
            if provider: await provider.close()
            provider = None
            voice_ready = False
            agent_orchestrator.cancel_staged_remediation()
            engine = new_engine
            await send({'type': 'engine_sync', 'engine': engine})
            await provider_status('idle' if settings.assemblyai_api_key else 'unconfigured')
            await sync()
        elif kind == 'start_voice': await init_voice()
        elif kind == 'stop_voice':
            await interrupt()
            if provider: await provider.close()
            provider = None
            voice_ready = False
            await provider_status('idle' if settings.assemblyai_api_key else 'unconfigured')
        elif kind in {'start_runbook', 'advance_runbook', 'abort_runbook'}:
            await interrupt()
            result = await session_work(agent_orchestrator.dispatch_tool, kind, {'runbook_id': data.get('runbook_id', 'runbook-pg-pool')} if kind == 'start_runbook' else {})
            spoken = result.get('spoken') or result.get('error', 'Runbook updated.')
            agent_orchestrator.record_turn('agent', spoken)
            await emit_response(spoken, result.get('executed_tools', []))
        elif kind == 'toggle_autopilot':
            await interrupt()
            await emit_response(agent_orchestrator.set_autopilot(data.get('enabled') is True))
        elif kind == 'simulate_scenario':
            if settings.infrastructure_mode != 'simulation': raise ValueError('Scenarios are available only in simulation mode')
            await interrupt()
            agent_orchestrator.cancel_staged_remediation()
            result = cluster_state.simulate_scenario(str(data.get('scenario', '')))
            agent_orchestrator.record_turn('agent', result['details'])
            await emit_response(result['details'])
        else: raise ValueError('Unknown command type')

    async def consume():
        while True:
            data = await voice_queue.get()
            try:
                if closed: return
                async with session.lock:
                    await process(data)
            except asyncio.CancelledError: raise
            except Exception as exc:
                await send({'type': 'error', 'message': str(exc) if isinstance(exc, ValueError) else 'The command failed. Please retry.'})
                await send({'type': 'agent_state', 'state': 'listening'})
            finally:
                await send({'type': 'command_complete', 'request_id': data.get('request_id')})
                voice_queue.task_done()

    async def maintain_session():
        while True:
            await asyncio.sleep(1)
            if not find_session(session.id):
                await websocket.close(code=4401)
                return
            if not session.lock.locked():
                async with session.lock:
                    if agent_orchestrator.expire_staged_remediation():
                        await send({'type': 'staging_sync', 'staged_action': None})
                        await send({'type': 'agent_state', 'state': 'listening'})
                        await send({'type': 'notice', 'message': 'Approval expired. Request the action again to continue.'})

    consumer = asyncio.create_task(consume())
    maintenance = asyncio.create_task(maintain_session())
    try:
        await sync()
        await send({'type': 'engine_sync', 'engine': engine})
        await provider_status('idle' if settings.assemblyai_api_key else 'unconfigured')
        while True:
            message = await websocket.receive()
            if message['type'] == 'websocket.disconnect': break
            if message.get('bytes'):
                pcm = message['bytes']
                if len(pcm) > 32000 or len(pcm) % 2:
                    await send({'type': 'error', 'message': 'Invalid audio frame'})
                    continue
                if provider and voice_ready:
                    blackbox_service.record_audio(pcm, 24000 if engine == 'voice_agent_api' else 16000)
                    try: await provider.send_audio(pcm)
                    except Exception: await provider_error('Audio stream disconnected. Reconnect voice to retry.')
            elif message.get('text'):
                try:
                    if len(message['text']) > 16000: raise ValueError('Command too large')
                    data = json.loads(message['text'])
                    if not isinstance(data, dict): raise ValueError('Expected a command object')
                    if data.get('type') == 'ping': await send({'type': 'pong'})
                    elif data.get('type') == 'barge_in': await interrupt()
                    elif voice_queue.full(): await send({'type': 'error', 'message': 'Please wait for the current command.'})
                    else: voice_queue.put_nowait(data)
                except (ValueError, json.JSONDecodeError):
                    await send({'type': 'error', 'message': 'Invalid control message'})
    except WebSocketDisconnect:
        pass
    finally:
        closed = True
        # Clear approval synchronously: disconnect cancellation can interrupt awaits.
        agent_orchestrator.cancel_staged_remediation()
        maintenance.cancel()
        if tts_task: tts_task.cancel()
        consumer.cancel()
        try:
            if provider: await provider.close()
            await asyncio.gather(maintenance, consumer, *( [tts_task] if tts_task else []), return_exceptions=True)
        finally:
            agent_orchestrator.cancel_staged_remediation()
            if session.connection_id == connection_id: session.connection_id = None

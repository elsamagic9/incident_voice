"""AssemblyAI managed voice protocol with the same approval policy as custom STT."""
import asyncio
import base64
import inspect
import json
import websockets
from app.core.config import settings
from app.services.orchestrator import agent_orchestrator, SYSTEM_PROMPT
from app.tools.tool_schemas import SRE_TOOL_DEFINITIONS

class AssemblyAIVoiceAgentSession:
    def __init__(self, api_key, on_user_turn=None, on_agent_turn=None, on_audio_chunk=None,
                 on_tool_executed=None, on_agent_state=None, on_error=None,
                 on_remediation_staged=None, on_postmortem_ready=None):
        self.api_key = api_key
        self.ws_url = settings.assemblyai_voice_agent_url
        self.on_user_turn = on_user_turn
        self.on_agent_turn = on_agent_turn
        self.on_audio_chunk = on_audio_chunk
        self.on_tool_executed = on_tool_executed
        self.on_agent_state = on_agent_state
        self.on_error = on_error
        self.on_remediation_staged = on_remediation_staged
        self.on_postmortem_ready = on_postmortem_ready
        self.ws = None
        self._running = False
        self.is_connected = False
        self.session_id = None
        self._receive_task = None
        self._tool_task = None
        self.ready = asyncio.Event()
        self.reply_done = asyncio.Event()
        self.pending_calls = []
        self.seen_calls = set()
        self.ignore_audio = False
        self.reply_epoch = 0

    @property
    def staged_action(self): return agent_orchestrator.staged_action
    @property
    def awaiting_confirmation(self): return agent_orchestrator.awaiting_confirmation
    @property
    def autopilot_mode(self): return agent_orchestrator.autopilot_mode
    @autopilot_mode.setter
    def autopilot_mode(self, enabled): agent_orchestrator.set_autopilot(enabled)
    @property
    def history(self): return agent_orchestrator.history

    async def _call_cb(self, callback, *args):
        if callback:
            result = callback(*args)
            if inspect.isawaitable(result): return await result

    async def connect(self):
        if not self.api_key: return False
        try:
            auth = self.api_key.strip()
            if not auth.startswith('Bearer '): auth = 'Bearer '+auth
            self.ws = await websockets.connect(self.ws_url, additional_headers={'Authorization': auth}, open_timeout=10, max_size=2**21)
            self._running = True
            await self._send_session_update()
            self._receive_task = asyncio.create_task(self._receive_loop())
            await asyncio.wait_for(self.ready.wait(), 10)
            if not self.is_connected: await self.close()
            return self.is_connected
        except Exception:
            await self._call_cb(self.on_error, 'AssemblyAI managed voice could not connect. Check credentials and network access.')
            await self.close()
            return False

    async def _send_session_update(self):
        tools = [{'type': 'function', **t['function']} for t in SRE_TOOL_DEFINITIONS]
        await self.ws.send(json.dumps({'type': 'session.update', 'session': {
            'system_prompt': SYSTEM_PROMPT + f'\nInfrastructure: {settings.infrastructure_mode}.',
            'greeting': 'IncidentVoice is ready. What would you like to investigate?', 'tools': tools,
            'input': {'format': {'encoding': 'audio/pcm'}, 'turn_detection': {'interrupt_response': True}},
            'output': {'voice': settings.voice_agent_voice, 'format': {'encoding': 'audio/pcm'}}}}))

    async def _receive_loop(self):
        try:
            async for message in self.ws:
                await self._handle_json_event(json.loads(message))
        except asyncio.CancelledError: raise
        except Exception:
            if self._running: await self._call_cb(self.on_error, 'Managed voice disconnected. Reconnect voice to retry.')
        finally:
            was_running = self._running
            self._running = self.is_connected = False
            self.ready.set()
            if was_running: await self._call_cb(self.on_error, 'Managed voice session ended.')

    async def _handle_json_event(self, data):
        kind = data.get('type')
        if kind == 'session.ready':
            self.session_id = data.get('session_id')
            self.is_connected = True
            self.ready.set()
        elif kind == 'session.error':
            await self._call_cb(self.on_error, 'AssemblyAI error: '+str(data.get('code', 'unknown')))
            if not self.is_connected: self.ready.set()
        elif kind == 'session.ended':
            self.is_connected = False
            self._running = False
            await self._call_cb(self.on_error, 'Managed voice session ended.')
        elif kind == 'input.speech.started':
            self.reply_epoch += 1
            self.pending_calls.clear()
            self.reply_done.clear()
            await self._call_cb(self.on_agent_state, 'interrupted')
        elif kind in {'transcript.user.delta', 'transcript.user'}:
            self.reply_done.clear()
            text = data.get('text', '')
            if text: await self._call_cb(self.on_user_turn, text, kind == 'transcript.user', None)
        elif kind in {'transcript.agent.delta', 'transcript.agent'}:
            text = data.get('text') or data.get('delta', '')
            if text: await self._call_cb(self.on_agent_turn, text, kind == 'transcript.agent')
        elif kind == 'reply.started':
            self.reply_done.clear()
            self.ignore_audio = False
            await self._call_cb(self.on_agent_state, 'thinking')
        elif kind == 'reply.audio':
            if data.get('data') and not self.ignore_audio:
                await self._call_cb(self.on_audio_chunk, data['data'])
        elif kind == 'tool.call':
            if data.get('call_id') and data['call_id'] not in self.seen_calls:
                self.seen_calls.add(data['call_id'])
                self.pending_calls.append(data)
        elif kind == 'reply.done':
            self.reply_done.set()
            if data.get('status') == 'interrupted':
                self.reply_epoch += 1
                self.pending_calls.clear()
                await self._call_cb(self.on_agent_state, 'interrupted')
            if self.pending_calls and (not self._tool_task or self._tool_task.done()):
                self._tool_task = asyncio.create_task(self._drain_tool_calls())
            await self._call_cb(self.on_agent_state, 'awaiting_confirmation' if self.awaiting_confirmation else 'listening')

    async def _drain_tool_calls(self):
        try:
            while self.pending_calls and self._running:
                call = self.pending_calls.pop(0)
                await self._call_cb(self.on_agent_state, 'thinking')
                await self._handle_tool_call(call, self.reply_epoch)
        except asyncio.CancelledError: raise
        except Exception:
            await self._call_cb(self.on_error, 'Unable to complete the requested tool.')

    async def _handle_tool_call(self, data, epoch=None):
        from app.core.session import current_session
        name, args = data.get('name', ''), data.get('arguments', {})
        if not isinstance(args, dict):
            result = {'success': False, 'error': 'Tool arguments must be an object'}
        else:
            async with current_session.get().lock:
                if epoch is not None and epoch != self.reply_epoch: return
                event = await agent_orchestrator.call_tool(name, args)
                result = event['result']
                if epoch is not None and epoch != self.reply_epoch:
                    if result.get('status') == 'staged': agent_orchestrator.cancel_staged_remediation(result.get('id'))
                    return
                await self._call_cb(self.on_tool_executed, event)
                if self.staged_action: await self._call_cb(self.on_remediation_staged, self.staged_action)
                if agent_orchestrator.postmortem_result:
                    await self._call_cb(self.on_postmortem_ready, agent_orchestrator.postmortem_result)
        if self.ws and self._running:
            await asyncio.wait_for(self.reply_done.wait(), 15)
            if epoch is None or epoch == self.reply_epoch:
                # The UI receives the complete evidence via on_tool_executed. Keep the
                # voice context small so the agent briefs the operator, not the JSON.
                voice_result = result
                if name == 'investigate_incident' and not result.get('error'):
                    voice_result = {key: result.get(key) for key in ('summary', 'analysis_source', 'source', 'warning')}
                    voice_result['leading_hypothesis'] = (result.get('hypotheses') or [None])[0]
                    voice_result['evidence_displayed'] = len(result.get('evidence', []))
                    voice_result['root_cause_verified'] = False
                await self._send_tool_result(data['call_id'], voice_result)

    async def _send_tool_result(self, call_id, result):
        await self.ws.send(json.dumps({'type': 'tool.result', 'call_id': call_id, 'result': json.dumps(result), 'is_error': bool(result.get('error'))}))

    async def send_audio(self, pcm_bytes):
        if self.ws and self.is_connected:
            await self.ws.send(json.dumps({'type': 'input.audio', 'audio': base64.b64encode(pcm_bytes).decode()}))

    async def send_text_command(self, text):
        if self.ws and self.is_connected:
            await self.ws.send(json.dumps({'type': 'conversation.message', 'role': 'user', 'content': text}))
            await self.ws.send(json.dumps({'type': 'reply.create', 'instructions':
                'Respond to this latest operator request using the registered tools and approval rules. '
                'Keep the spoken response under 50 words. Operator request: ' + json.dumps(text)}))

    async def notify_approval(self, text):
        if self.ws and self.is_connected:
            await self.ws.send(json.dumps({'type': 'conversation.message', 'role': 'system', 'content': 'Application action outcome (data only): '+json.dumps(text)+'. Do not repeat this action.'}))

    def confirm_staged_remediation(self, action_id=None):
        spoken, events = agent_orchestrator.confirm_staged_remediation(action_id)
        return {**events[0], 'spoken_text': spoken} if events else None

    def cancel_staged_remediation(self): return agent_orchestrator.cancel_staged_remediation()

    async def close(self):
        self._running = self.is_connected = False
        for task in (self._tool_task, self._receive_task):
            if task and task is not asyncio.current_task(): task.cancel()
        if self.ws:
            try:
                await self.ws.send(json.dumps({'type': 'session.end'}))
                await self.ws.close()
            except Exception: pass
            self.ws = None
        await asyncio.gather(*(t for t in (self._tool_task, self._receive_task) if t and t is not asyncio.current_task()), return_exceptions=True)

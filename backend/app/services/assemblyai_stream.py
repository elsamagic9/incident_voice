import asyncio
import inspect
import json
import websockets
from app.core.config import settings

class AssemblyAIStreamSession:
    def __init__(self, api_key, on_turn, on_error=None):
        self.api_key = api_key
        self.on_turn = on_turn
        self.on_error = on_error
        self.ws = None
        self._running = False
        self._receive_task = None
        self.ready = asyncio.Event()
        self.seen_turns = set()

    async def _error(self, message):
        if self.on_error:
            result = self.on_error(message)
            if inspect.isawaitable(result): await result

    async def connect(self):
        if not self.api_key: return False
        try:
            self.ws = await websockets.connect(settings.assemblyai_streaming_url,
                additional_headers={'Authorization': self.api_key.strip()}, open_timeout=10, max_size=2**20)
            self._running = True
            self._receive_task = asyncio.create_task(self._receive_loop())
            await asyncio.wait_for(self.ready.wait(), 10)
            return self._running
        except Exception:
            await self._error('AssemblyAI transcription could not connect. Check credentials and network access.')
            await self.close()
            return False

    async def _receive_loop(self):
        try:
            async for message in self.ws:
                data = json.loads(message)
                kind = data.get('type')
                if kind == 'Begin': self.ready.set()
                elif kind == 'Turn':
                    text = data.get('transcript', '')
                    final = data.get('end_of_turn', False)
                    order = data.get('turn_order')
                    if final and order is not None:
                        if order in self.seen_turns: continue
                        self.seen_turns.add(order)
                    if text.strip():
                        result = self.on_turn(text, final, data.get('end_of_turn_confidence'))
                        if inspect.isawaitable(result): await result
                elif kind == 'Termination': break
                elif kind == 'Error' or data.get('error'):
                    await self._error('AssemblyAI transcription rejected the stream.')
                    break
        except asyncio.CancelledError:
            raise
        except Exception:
            if self._running: await self._error('AssemblyAI transcription disconnected. Reconnect voice to retry.')
        finally:
            was_running = self._running
            self._running = False
            self.ready.set()
            if was_running: await self._error('Transcription stream ended. Reconnect voice to continue.')

    async def send_audio(self, pcm_bytes):
        if self.ws and self._running and self.ready.is_set():
            await self.ws.send(pcm_bytes)

    async def close(self):
        self._running = False
        if self.ws:
            try:
                await self.ws.send(json.dumps({'type': 'Terminate'}))
                await self.ws.close()
            except Exception: pass
            self.ws = None
        if self._receive_task and self._receive_task is not asyncio.current_task():
            self._receive_task.cancel()
            await asyncio.gather(self._receive_task, return_exceptions=True)

import asyncio
import json
import logging
from typing import Callable, Optional
import websockets

logger = logging.getLogger("assemblyai_stream")

class AssemblyAIStreamSession:
    """
    Manages a real-time streaming WebSocket session with AssemblyAI Streaming v3 API.
    URL: wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=universal-3-5-pro&format_turns=true
    """

    def __init__(
        self,
        api_key: str,
        on_turn: Callable[[str, bool, Optional[float]], None],
        on_error: Optional[Callable[[str], None]] = None
    ):
        self.api_key = api_key
        self.on_turn = on_turn
        self.on_error = on_error or (lambda err: logger.error(f"AssemblyAI Stream Error: {err}"))
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self._running = False
        self._receive_task: Optional[asyncio.Task] = None

    async def connect(self) -> bool:
        if not self.api_key:
            logger.warning("No AssemblyAI API key provided. Operating in mock/offline mode.")
            return False

        url = (
            "wss://streaming.assemblyai.com/v3/ws"
            "?sample_rate=16000"
            "&speech_model=universal-3-5-pro"
            "&format_turns=true"
        )
        headers = {
            "Authorization": self.api_key.strip()
        }

        try:
            self.ws = await websockets.connect(
                url,
                additional_headers=headers,
                ping_interval=20,
                ping_timeout=10
            )
            self._running = True
            self._receive_task = asyncio.create_task(self._receive_loop())
            logger.info("Connected to AssemblyAI Streaming v3 WebSocket.")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to AssemblyAI Streaming v3: {e}")
            self.on_error(str(e))
            return False

    async def _receive_loop(self):
        try:
            while self._running and self.ws:
                message = await self.ws.recv()
                if isinstance(message, str):
                    data = json.loads(message)
                    msg_type = data.get("type")

                    if msg_type == "SessionBegins":
                        logger.info(f"AssemblyAI Session Began: {data.get('session_id')}")
                    elif msg_type == "Turn":
                        transcript = data.get("transcript", "")
                        end_of_turn = data.get("end_of_turn", False)
                        confidence = data.get("confidence")
                        if transcript.strip():
                            # Trigger callback
                            if asyncio.iscoroutinefunction(self.on_turn):
                                await self.on_turn(transcript, end_of_turn, confidence)
                            else:
                                self.on_turn(transcript, end_of_turn, confidence)
                    elif msg_type == "SessionTerminated":
                        logger.info("AssemblyAI Session Terminated cleanly.")
                        break
        except websockets.ConnectionClosed as cc:
            logger.info(f"AssemblyAI WebSocket closed: {cc.code} {cc.reason}")
        except Exception as e:
            logger.error(f"Error in AssemblyAI receive loop: {e}")
            self.on_error(str(e))
        finally:
            self._running = False

    async def send_audio(self, pcm_bytes: bytes):
        """Sends raw 16kHz 16-bit mono PCM audio chunk to AssemblyAI."""
        if self.ws and self._running:
            try:
                await self.ws.send(pcm_bytes)
            except Exception as e:
                logger.error(f"Failed to send audio chunk: {e}")

    async def close(self):
        self._running = False
        if self.ws:
            try:
                # Send terminate message as per AssemblyAI v3 spec
                await self.ws.send(json.dumps({"type": "Terminate"}))
                await self.ws.close()
            except Exception:
                pass
            self.ws = None
        if self._receive_task and not self._receive_task.done():
            self._receive_task.cancel()

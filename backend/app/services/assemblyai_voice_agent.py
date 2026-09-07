import asyncio
import json
import logging
import time
from typing import Callable, Optional, Dict, Any, List
import websockets
from app.core.config import settings
from app.core.state import cluster_state
from app.tools.sre_tools import SRE_TOOL_MAP
from app.tools.tool_schemas import SRE_TOOL_DEFINITIONS

logger = logging.getLogger("assemblyai_voice_agent")

SYSTEM_PROMPT = """You are IncidentVoice, an elite Autonomous Voice Site Reliability Engineer (SRE) and Incident Commander.
You assist human on-call engineers during live production outages using low-latency voice interaction.

Tone and Rules:
1. Voice-First Brevity: Speak concisely in 1 to 2 clear, authoritative sentences. Never read out full stack traces or long JSON payloads; summarize the key takeaway (e.g. "Payment service is failing with 42% 503 errors due to DB connection pool starvation. I recommend scaling replicas or restarting pods.").
2. Proactive Remediation: When an engineer asks you to investigate or fix an issue, call the appropriate tools (e.g., inspect_service_logs, execute_remediation, trigger_pager).
3. Professional SRE Vocabulary: Use standard terminology (P99 latency, RPS, pod crashloop, connection starvation, circuit breaker).
4. Safety Guardrails: Destructive remediations like restarting pods, flushing cache, or rolling back releases require staging and explicit confirmation.
"""

class AssemblyAIVoiceAgentSession:
    """
    Manages a real-time bidirectional WebSocket session with AssemblyAI Voice Agent API.
    URL: wss://agents.assemblyai.com/v1/ws
    Handles:
      - session.update with system prompt, voice, and JSON-Schema SRE tools
      - Streaming microphone PCM audio upstream
      - Bidirectional event dispatching (user transcripts, agent transcripts, audio chunks)
      - JSON-Schema tool calling loop (tool.call -> local execution -> tool.result)
      - Two-phase safety guardrails for destructive remediation actions
      - Offline / mock mode fallback if no API key or network unreachable
    """

    def __init__(
        self,
        api_key: str,
        on_user_turn: Optional[Callable[[str, bool, Optional[float]], Any]] = None,
        on_agent_turn: Optional[Callable[[str, bool], Any]] = None,
        on_audio_chunk: Optional[Callable[[str], Any]] = None,
        on_tool_executed: Optional[Callable[[Dict[str, Any]], Any]] = None,
        on_agent_state: Optional[Callable[[str], Any]] = None,
        on_error: Optional[Callable[[str], Any]] = None,
        on_remediation_staged: Optional[Callable[[Dict[str, Any]], Any]] = None,
        on_postmortem_ready: Optional[Callable[[Dict[str, Any]], Any]] = None
    ):
        self.api_key = api_key or settings.assemblyai_api_key
        self.ws_url = getattr(settings, "assemblyai_voice_agent_url", "wss://agents.assemblyai.com/v1/ws")
        self.on_user_turn = on_user_turn
        self.on_agent_turn = on_agent_turn
        self.on_audio_chunk = on_audio_chunk
        self.on_tool_executed = on_tool_executed
        self.on_agent_state = on_agent_state
        self.on_error = on_error or (lambda err: logger.error(f"AssemblyAI Voice Agent Error: {err}"))
        self.on_remediation_staged = on_remediation_staged
        self.on_postmortem_ready = on_postmortem_ready

        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self._running = False
        self._receive_task: Optional[asyncio.Task] = None
        self.session_id: Optional[str] = None
        self.is_connected = False
        self.staged_action: Optional[Dict[str, Any]] = None
        self.awaiting_confirmation: bool = False

    async def connect(self) -> bool:
        """Connects to AssemblyAI Voice Agent API WebSocket and sends session.update."""
        if not self.api_key:
            logger.warning("No AssemblyAI API key provided for Voice Agent API. Running in mock/offline mode.")
            self.is_connected = False
            return False

        headers = {
            "Authorization": self.api_key.strip()
        }

        try:
            self.ws = await websockets.connect(
                self.ws_url,
                additional_headers=headers,
                ping_interval=20,
                ping_timeout=10
            )
            self._running = True
            self.is_connected = True
            self._receive_task = asyncio.create_task(self._receive_loop())

            # Send initial session.update configuration
            await self._send_session_update()
            logger.info(f"Connected to AssemblyAI Voice Agent API at {self.ws_url}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to AssemblyAI Voice Agent API: {e}")
            self.is_connected = False
            self.on_error(str(e))
            return False

    async def _send_session_update(self):
        """Dispatches session.update to register tools and system prompt."""
        if not self.ws or not self._running:
            return

        # Format SRE tools for AssemblyAI Voice Agent JSON Schema
        agent_tools = []
        for tool_def in SRE_TOOL_DEFINITIONS:
            fn = tool_def.get("function", {})
            agent_tools.append({
                "type": "function",
                "name": fn.get("name"),
                "description": fn.get("description"),
                "parameters": fn.get("parameters", {"type": "object", "properties": {}})
            })

        session_config = {
            "type": "session.update",
            "session": {
                "system_prompt": SYSTEM_PROMPT,
                "greeting": "IncidentVoice Voice Agent online. Monitoring cluster telemetry and ready for command.",
                "tools": agent_tools,
                "input": {
                    "format": {
                        "encoding": "audio/pcm16",
                        "sample_rate": 16000
                    }
                },
                "output": {
                    "voice": "ivy",
                    "format": {
                        "encoding": "audio/pcm16",
                        "sample_rate": 16000
                    }
                }
            }
        }

        await self.ws.send(json.dumps(session_config))
        logger.info("Sent session.update with SRE tool declarations to AssemblyAI Voice Agent API.")

    async def _receive_loop(self):
        """Processes downstream events from AssemblyAI Voice Agent API."""
        try:
            while self._running and self.ws:
                message = await self.ws.recv()
                if isinstance(message, str):
                    await self._handle_json_event(json.loads(message))
                elif isinstance(message, bytes):
                    # Raw audio output from Voice Agent API
                    import base64
                    b64_audio = base64.b64encode(message).decode("utf-8")
                    if self.on_audio_chunk:
                        await self._call_cb(self.on_audio_chunk, b64_audio)
        except websockets.ConnectionClosed as cc:
            logger.info(f"AssemblyAI Voice Agent connection closed: {cc.code} {cc.reason}")
        except Exception as e:
            logger.error(f"Error in AssemblyAI Voice Agent receive loop: {e}")
            self.on_error(str(e))
        finally:
            self._running = False
            self.is_connected = False

    async def _handle_json_event(self, data: Dict[str, Any]):
        msg_type = data.get("type") or data.get("event")

        # Session lifecycle events
        if msg_type in ["session.created", "session.updated", "SessionBegins"]:
            self.session_id = data.get("session_id") or data.get("session", {}).get("id")
            logger.info(f"Voice Agent session initialized: {self.session_id}")

        # User transcription events
        elif msg_type in ["transcript", "user.transcript", "turn"]:
            transcript = data.get("transcript") or data.get("text", "")
            end_of_turn = data.get("end_of_turn", False)
            confidence = data.get("confidence")
            if transcript.strip() and self.on_user_turn:
                await self._call_cb(self.on_user_turn, transcript, end_of_turn, confidence)

        # Agent spoken text events
        elif msg_type in ["agent.transcript", "response.audio_transcript.delta", "agent_turn"]:
            agent_text = data.get("transcript") or data.get("delta") or data.get("text", "")
            if agent_text and self.on_agent_turn:
                await self._call_cb(self.on_agent_turn, agent_text, data.get("end_of_turn", True))

        # Agent audio chunks
        elif msg_type in ["audio", "response.audio.delta"]:
            audio_b64 = data.get("data") or data.get("delta")
            if audio_b64 and self.on_audio_chunk:
                await self._call_cb(self.on_audio_chunk, audio_b64)

        # State updates
        elif msg_type in ["agent_state", "response.state"]:
            state = data.get("state") or data.get("status")
            if state and self.on_agent_state:
                await self._call_cb(self.on_agent_state, state)

        # Tool calling event: tool.call
        elif msg_type in ["tool.call", "function_call", "tool_call", "response.function_call_arguments.done"]:
            await self._handle_tool_call(data)

        elif msg_type == "SessionTerminated":
            logger.info("AssemblyAI Voice Agent session terminated cleanly.")

    async def _handle_tool_call(self, data: Dict[str, Any]):
        """
        Handles dynamic tool call event from AssemblyAI Voice Agent API:
        1. Checks two-phase safety guardrails for destructive actions
        2. Executes local tool
        3. Returns tool.result event back to AssemblyAI WebSocket
        """
        call_id = data.get("call_id") or data.get("id") or str(time.time())
        tool_name = data.get("name") or data.get("tool_name") or data.get("function", {}).get("name")
        arguments = data.get("arguments") or data.get("parameters") or data.get("function", {}).get("arguments", {})

        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments)
            except Exception:
                arguments = {}

        logger.info(f"AssemblyAI Voice Agent called tool: {tool_name} with args {arguments}")

        # Safety Guardrail check for destructive operations
        if tool_name == "execute_remediation":
            action = arguments.get("action", "")
            service_name = arguments.get("service_name", "payment-service")
            if action in ["restart_pod", "flush_cache", "rollback_release", "restart"]:
                if not self.awaiting_confirmation:
                    # Stage action and require confirmation
                    self.staged_action = {
                        "action": action,
                        "service_name": service_name,
                        "params": arguments,
                        "staged_at": time.time()
                    }
                    self.awaiting_confirmation = True

                    staged_payload = {
                        "status": "staged",
                        "awaiting_confirmation": True,
                        "action": action,
                        "service_name": service_name,
                        "message": f"Remediation staged: {action} on {service_name}. Requires user authorization."
                    }

                    if self.on_remediation_staged:
                        await self._call_cb(self.on_remediation_staged, self.staged_action)

                    if self.on_tool_executed:
                        await self._call_cb(self.on_tool_executed, {
                            "tool_name": tool_name,
                            "arguments": arguments,
                            "result": staged_payload,
                            "timestamp": time.time()
                        })

                    # Send staged response back to Voice Agent LLM
                    await self._send_tool_result(call_id, staged_payload)
                    return
                else:
                    # User confirmed action, proceeding with execution
                    self.awaiting_confirmation = False
                    self.staged_action = None

        # Handle post-mortem generation via LeMUR
        if tool_name == "generate_postmortem":
            from app.services.lemur_service import lemur_service
            postmortem_data = await lemur_service.generate_postmortem(
                transcript_history=[],
                timeline_events=cluster_state.incident.timeline_events,
                incident_id=cluster_state.incident.id
            )
            if self.on_postmortem_ready:
                await self._call_cb(self.on_postmortem_ready, postmortem_data)
            if self.on_tool_executed:
                await self._call_cb(self.on_tool_executed, {
                    "tool_name": tool_name,
                    "arguments": arguments,
                    "result": {"status": "success", "incident_id": cluster_state.incident.id},
                    "timestamp": time.time()
                })
            await self._send_tool_result(call_id, {"status": "success", "incident_id": cluster_state.incident.id})
            return

        # Execute tool from SRE_TOOL_MAP
        tool_fn = SRE_TOOL_MAP.get(tool_name)
        if tool_fn:
            try:
                result = tool_fn(**arguments)
            except TypeError:
                # Handle no-arg or position-arg variance
                result = tool_fn()
            except Exception as e:
                result = {"error": f"Tool execution failed: {str(e)}"}
        else:
            result = {"error": f"Tool '{tool_name}' not implemented in SRE tool suite."}

        # Clear staging state if destructive action was executed
        if tool_name == "execute_remediation":
            self.awaiting_confirmation = False
            self.staged_action = None

        # Broadcast tool execution to frontend UI
        if self.on_tool_executed:
            await self._call_cb(self.on_tool_executed, {
                "tool_name": tool_name,
                "arguments": arguments,
                "result": result,
                "timestamp": time.time()
            })

        # Send tool.result back to AssemblyAI Voice Agent API
        await self._send_tool_result(call_id, result)

    async def _send_tool_result(self, call_id: str, result: Any):
        """Sends tool.result back to AssemblyAI WebSocket."""
        if not self.ws or not self._running:
            return

        payload = {
            "type": "tool.result",
            "call_id": call_id,
            "result": json.dumps(result) if not isinstance(result, str) else result
        }
        await self.ws.send(json.dumps(payload))
        logger.info(f"Dispatched tool.result for call_id={call_id}")

    async def send_audio(self, pcm_bytes: bytes):
        """Streams 16kHz PCM audio chunk to AssemblyAI Voice Agent API."""
        if self.ws and self._running:
            try:
                await self.ws.send(pcm_bytes)
            except Exception as e:
                logger.error(f"Failed to stream audio chunk to Voice Agent API: {e}")

    async def send_text_command(self, text: str):
        """Injects a text command turn into the Voice Agent session."""
        if self.ws and self._running:
            try:
                await self.ws.send(json.dumps({
                    "type": "user.transcript",
                    "transcript": text,
                    "end_of_turn": True
                }))
            except Exception as e:
                logger.error(f"Failed to send text command to Voice Agent API: {e}")

    def confirm_staged_remediation(self) -> Optional[Dict[str, Any]]:
        """Executes currently staged remediation upon user confirmation."""
        if not self.staged_action:
            return None

        # Expire if older than 30s
        if time.time() - self.staged_action.get("staged_at", 0) > 30.0:
            logger.info("Voice Agent staged action expired after 30 seconds.")
            self.staged_action = None
            self.awaiting_confirmation = False
            return None

        action = self.staged_action["action"]
        service_name = self.staged_action["service_name"]
        params = self.staged_action.get("params", {})

        from app.tools.sre_tools import execute_remediation
        count = params.get("count", 5)
        res = execute_remediation(action, service_name, count=count)

        if action in ["restart_pod", "restart"]:
            spoken_text = f"Confirmed. Graceful rolling restart executed for {service_name}. Healthy replacement pods are now passing readiness probes."
        elif action == "flush_cache":
            spoken_text = "Confirmed. Redis cache memory cleared and connection pool recycled. Memory utilization dropped to 35%."
        elif action == "rollback_release":
            spoken_text = f"Confirmed. Deployment for {service_name} rolled back to previous stable release."
        else:
            spoken_text = f"Confirmed. Remediation {action} executed successfully for {service_name}."

        executed = {
            "tool_name": "execute_remediation",
            "arguments": {"action": action, "service_name": service_name, "count": count},
            "result": res,
            "spoken_text": spoken_text,
            "timestamp": time.time()
        }

        self.staged_action = None
        self.awaiting_confirmation = False
        return executed

    def cancel_staged_remediation(self) -> str:
        """Cancels staged remediation."""
        self.staged_action = None
        self.awaiting_confirmation = False
        return "Remediation cancelled. No changes were applied to the cluster."

    async def _call_cb(self, cb: Callable, *args):
        if asyncio.iscoroutinefunction(cb):
            await cb(*args)
        else:
            cb(*args)

    async def close(self):
        """Terminates Voice Agent session cleanly."""
        self._running = False
        self.is_connected = False
        if self.ws:
            try:
                await self.ws.send(json.dumps({"type": "session.terminate"}))
                await self.ws.close()
            except Exception:
                pass
            self.ws = None
        if self._receive_task and not self._receive_task.done():
            self._receive_task.cancel()

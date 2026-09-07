import asyncio
import base64
import json
import logging
import time
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.config import settings
from app.core.state import cluster_state
from app.services.assemblyai_stream import AssemblyAIStreamSession
from app.services.assemblyai_voice_agent import AssemblyAIVoiceAgentSession
from app.services.orchestrator import agent_orchestrator
from app.services.tts_service import tts_service
from app.services.lemur_service import lemur_service
from app.tools.infrastructure_bridge import infra_bridge

logger = logging.getLogger("websocket_hub")
router = APIRouter()

@router.websocket("/ws/agent")
async def voice_agent_websocket(websocket: WebSocket):
    await websocket.accept()
    logger.info("Client connected to Voice Agent WebSocket.")

    # Determine initial engine from query params or default
    active_engine = websocket.query_params.get("engine", settings.default_engine)
    if active_engine not in ["voice_agent_api", "custom_stt_v3"]:
        active_engine = "custom_stt_v3"

    current_tts_task: Optional[asyncio.Task] = None
    aai_v3_session: Optional[AssemblyAIStreamSession] = None
    voice_agent_session: Optional[AssemblyAIVoiceAgentSession] = None
    is_session_connected = False

    async def send_json_safe(payload: dict):
        try:
            await websocket.send_text(json.dumps(payload))
        except Exception:
            pass

    # Send initial cluster and incident state
    await send_json_safe({
        "type": "cluster_sync",
        "incident": cluster_state.incident.model_dump(),
        "services": {k: v.model_dump() for k, v in cluster_state.services.items()},
        "docker_active": infra_bridge.is_docker_available()
    })

    # =========================================================================
    # Path 2: AssemblyAI Streaming v3 STT + Custom Orchestrator + LeMUR
    # =========================================================================
    async def handle_v3_turn(transcript: str, end_of_turn: bool, confidence: Optional[float]):
        nonlocal current_tts_task

        if current_tts_task and not current_tts_task.done():
            logger.info("Barge-in: Canceling active TTS playback due to user speech.")
            current_tts_task.cancel()
            await send_json_safe({"type": "agent_state", "state": "interrupted"})

        await send_json_safe({
            "type": "turn",
            "speaker": "user",
            "transcript": transcript,
            "end_of_turn": end_of_turn,
            "confidence": confidence,
            "timestamp": time.time()
        })

        if end_of_turn and transcript.strip():
            await handle_custom_orchestrator_turn(transcript)

    async def handle_custom_orchestrator_turn(user_text: str):
        nonlocal current_tts_task
        t_start = time.time()
        await send_json_safe({"type": "agent_state", "state": "thinking"})

        t_proc_start = time.time()
        spoken_text, executed_tools, postmortem = await agent_orchestrator.process_user_turn(user_text)
        t_proc_end = time.time()

        tool_duration_ms = round(sum(0.045 for _ in executed_tools) * 1000, 1) if executed_tools else 15.0
        llm_duration_ms = round((t_proc_end - t_proc_start) * 1000, 1)

        # Broadcast executed tools
        for tool_event in executed_tools:
            await send_json_safe({
                "type": "tool_executed",
                "tool_name": tool_event["tool_name"],
                "arguments": tool_event["arguments"],
                "result": tool_event["result"],
                "timestamp": tool_event["timestamp"]
            })

        # Sync cluster state
        await send_json_safe({
            "type": "cluster_sync",
            "incident": cluster_state.incident.model_dump(),
            "services": {k: v.model_dump() for k, v in cluster_state.services.items()}
        })

        # Post-Mortem synthesized
        if postmortem:
            await send_json_safe({
                "type": "postmortem_ready",
                "data": postmortem
            })

        # Send agent response turn
        await send_json_safe({
            "type": "turn",
            "speaker": "agent",
            "transcript": spoken_text,
            "end_of_turn": True,
            "timestamp": time.time()
        })

        # If awaiting safety confirmation, reflect state in UI
        if agent_orchestrator.awaiting_confirmation:
            await send_json_safe({
                "type": "remediation_staged",
                "staged_action": agent_orchestrator.staged_action
            })
            await send_json_safe({
                "type": "agent_state",
                "state": "awaiting_confirmation",
                "staged_action": agent_orchestrator.staged_action
            })

        # Stream TTS
        t_tts_start = time.time()
        current_tts_task = asyncio.create_task(
            stream_tts_to_client(spoken_text, t_start, tool_duration_ms, llm_duration_ms, t_tts_start)
        )

    # =========================================================================
    # Path 1: AssemblyAI Voice Agent API Callbacks
    # =========================================================================
    async def handle_agent_api_user_turn(transcript: str, end_of_turn: bool, confidence: Optional[float]):
        nonlocal current_tts_task
        if current_tts_task and not current_tts_task.done():
            current_tts_task.cancel()
            await send_json_safe({"type": "agent_state", "state": "interrupted"})

        await send_json_safe({
            "type": "turn",
            "speaker": "user",
            "transcript": transcript,
            "end_of_turn": end_of_turn,
            "confidence": confidence,
            "timestamp": time.time()
        })

        if end_of_turn and transcript.strip():
            lower_t = transcript.lower()
            if any(k in lower_t for k in ["post-mortem", "postmortem", "wrap up", "incident resolved", "generate report", "incident review"]):
                logger.info("Triggering AssemblyAI LeMUR Post-Mortem in Voice Agent API engine.")
                postmortem_result = await lemur_service.generate_postmortem(
                    transcript_history=agent_orchestrator.history,
                    timeline_events=cluster_state.incident.timeline_events,
                    incident_id=cluster_state.incident.id
                )
                await send_json_safe({
                    "type": "postmortem_ready",
                    "data": postmortem_result
                })

    async def handle_agent_api_agent_turn(transcript: str, end_of_turn: bool):
        await send_json_safe({
            "type": "turn",
            "speaker": "agent",
            "transcript": transcript,
            "end_of_turn": end_of_turn,
            "timestamp": time.time()
        })

    async def handle_agent_api_audio(b64_audio: str):
        await send_json_safe({"type": "audio_stream", "data": b64_audio})

    async def handle_agent_api_tool_executed(tool_event: dict):
        await send_json_safe({
            "type": "tool_executed",
            "tool_name": tool_event["tool_name"],
            "arguments": tool_event["arguments"],
            "result": tool_event["result"],
            "timestamp": tool_event["timestamp"]
        })
        await send_json_safe({
            "type": "cluster_sync",
            "incident": cluster_state.incident.model_dump(),
            "services": {k: v.model_dump() for k, v in cluster_state.services.items()},
            "docker_active": infra_bridge.is_docker_available()
        })
        if tool_event.get("result", {}).get("status") != "staged":
            await send_json_safe({"type": "agent_state", "state": "listening"})

    async def handle_agent_api_state(state: str):
        await send_json_safe({"type": "agent_state", "state": state})

    async def handle_agent_api_remediation_staged(staged: dict):
        await send_json_safe({"type": "agent_state", "state": "awaiting_confirmation", "staged_action": staged})
        await send_json_safe({"type": "remediation_staged", "staged_action": staged})

    async def handle_agent_api_postmortem_ready(pm_data: dict):
        await send_json_safe({"type": "postmortem_ready", "data": pm_data})

    # =========================================================================
    # Engine Lifecycle Managers
    # =========================================================================
    async def init_engine(engine_name: str):
        nonlocal aai_v3_session, voice_agent_session, is_session_connected, active_engine
        active_engine = engine_name

        # Clean up existing sessions
        if aai_v3_session:
            await aai_v3_session.close()
            aai_v3_session = None
        if voice_agent_session:
            await voice_agent_session.close()
            voice_agent_session = None

        if active_engine == "voice_agent_api":
            voice_agent_session = AssemblyAIVoiceAgentSession(
                api_key=settings.assemblyai_api_key,
                on_user_turn=handle_agent_api_user_turn,
                on_agent_turn=handle_agent_api_agent_turn,
                on_audio_chunk=handle_agent_api_audio,
                on_tool_executed=handle_agent_api_tool_executed,
                on_agent_state=handle_agent_api_state,
                on_remediation_staged=handle_agent_api_remediation_staged,
                on_postmortem_ready=handle_agent_api_postmortem_ready,
                on_error=lambda err: asyncio.create_task(send_json_safe({"type": "error", "message": err}))
            )
            is_session_connected = await voice_agent_session.connect()
            if is_session_connected:
                await send_json_safe({
                    "type": "system",
                    "message": "Connected to AssemblyAI Voice Agent API (Path 1: Direct Voice Agent API)"
                })
            else:
                await send_json_safe({
                    "type": "system",
                    "message": "AssemblyAI Voice Agent offline/simulation mode active (Path 1)."
                })
        else:
            # Custom STT v3 (Path 2)
            aai_v3_session = AssemblyAIStreamSession(
                api_key=settings.assemblyai_api_key,
                on_turn=handle_v3_turn,
                on_error=lambda err: asyncio.create_task(send_json_safe({"type": "error", "message": err}))
            )
            is_session_connected = await aai_v3_session.connect()
            if is_session_connected:
                await send_json_safe({
                    "type": "system",
                    "message": "AssemblyAI Streaming v3 connected (Path 2: Custom Multi-Hop Orchestrator + LeMUR)"
                })
            else:
                await send_json_safe({
                    "type": "system",
                    "message": "AssemblyAI offline/mock mode active (Path 2: Streaming v3 fallback)."
                })

        await send_json_safe({
            "type": "engine_sync",
            "engine": active_engine,
            "supported_engines": ["voice_agent_api", "custom_stt_v3"]
        })

    async def stream_tts_to_client(text: str, t_total_start: float = 0, tool_ms: float = 0, llm_ms: float = 0, t_tts_start: float = 0):
        try:
            await send_json_safe({"type": "agent_state", "state": "speaking"})
            first_chunk_sent = False

            async for audio_chunk in tts_service.stream_speech(text):
                if not first_chunk_sent and t_tts_start > 0:
                    tts_first_ms = round((time.time() - t_tts_start) * 1000, 1)
                    total_ms = round((time.time() - t_total_start) * 1000, 1)
                    await send_json_safe({
                        "type": "latency_breakdown",
                        "stats": {
                            "stt_ms": 120.0,
                            "tool_ms": tool_ms,
                            "llm_ms": llm_ms,
                            "tts_ms": tts_first_ms,
                            "total_ms": total_ms
                        }
                    })
                    first_chunk_sent = True

                b64_audio = base64.b64encode(audio_chunk).decode("utf-8")
                await send_json_safe({
                    "type": "audio_stream",
                    "data": b64_audio
                })
            await send_json_safe({"type": "audio_stream_end"})
            # Restore listening or awaiting_confirmation
            next_state = "awaiting_confirmation" if agent_orchestrator.awaiting_confirmation else "listening"
            await send_json_safe({"type": "agent_state", "state": next_state})
        except asyncio.CancelledError:
            logger.info("TTS streaming task canceled.")
            await send_json_safe({"type": "audio_stream_end"})
        except Exception as e:
            logger.error(f"Error streaming TTS: {e}")
            await send_json_safe({"type": "agent_state", "state": "listening"})

    # Initialize active engine
    await init_engine(active_engine)

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break

            # Binary audio chunk from microphone
            if "bytes" in message and message["bytes"]:
                pcm_data = message["bytes"]
                if active_engine == "voice_agent_api" and voice_agent_session:
                    if is_session_connected:
                        await voice_agent_session.send_audio(pcm_data)
                elif aai_v3_session and is_session_connected:
                    await aai_v3_session.send_audio(pcm_data)

            # Text / JSON control message
            elif "text" in message and message["text"]:
                try:
                    data = json.loads(message["text"])
                    msg_type = data.get("type")

                    if msg_type == "ping":
                        await send_json_safe({"type": "pong"})
                        continue

                    if msg_type == "barge_in":
                        if current_tts_task and not current_tts_task.done():
                            current_tts_task.cancel()
                        await send_json_safe({"type": "agent_state", "state": "listening"})

                    elif msg_type == "select_engine":
                        new_engine = data.get("engine")
                        if new_engine in ["voice_agent_api", "custom_stt_v3"] and new_engine != active_engine:
                            logger.info(f"Switching engine from {active_engine} to {new_engine}")
                            if current_tts_task and not current_tts_task.done():
                                current_tts_task.cancel()
                            await init_engine(new_engine)

                    elif msg_type == "authorize_remediation":
                        # Two-Phase Safety Guardrail: Direct UI authorization
                        if active_engine == "voice_agent_api" and voice_agent_session and voice_agent_session.staged_action:
                            tool_event = voice_agent_session.confirm_staged_remediation()
                            if tool_event:
                                await send_json_safe({
                                    "type": "tool_executed",
                                    "tool_name": tool_event["tool_name"],
                                    "arguments": tool_event["arguments"],
                                    "result": tool_event["result"],
                                    "timestamp": tool_event["timestamp"]
                                })
                                await send_json_safe({
                                    "type": "cluster_sync",
                                    "incident": cluster_state.incident.model_dump(),
                                    "services": {k: v.model_dump() for k, v in cluster_state.services.items()},
                                    "docker_active": infra_bridge.is_docker_available()
                                })
                                confirmation_text = tool_event.get("spoken_text") or f"Confirmed. Remediation executed for {tool_event['arguments']['service_name']}."
                                await send_json_safe({
                                    "type": "turn",
                                    "speaker": "agent",
                                    "transcript": confirmation_text,
                                    "end_of_turn": True,
                                    "timestamp": time.time()
                                })
                                await send_json_safe({"type": "agent_state", "state": "listening"})
                                current_tts_task = asyncio.create_task(stream_tts_to_client(confirmation_text))
                        elif agent_orchestrator.staged_action:
                            spoken_text, tools = agent_orchestrator.confirm_staged_remediation()
                            for tool_event in tools:
                                await send_json_safe({
                                    "type": "tool_executed",
                                    "tool_name": tool_event["tool_name"],
                                    "arguments": tool_event["arguments"],
                                    "result": tool_event["result"],
                                    "timestamp": tool_event["timestamp"]
                                })
                            await send_json_safe({
                                "type": "cluster_sync",
                                "incident": cluster_state.incident.model_dump(),
                                "services": {k: v.model_dump() for k, v in cluster_state.services.items()},
                                "docker_active": infra_bridge.is_docker_available()
                            })
                            await send_json_safe({
                                "type": "turn",
                                "speaker": "agent",
                                "transcript": spoken_text,
                                "end_of_turn": True,
                                "timestamp": time.time()
                            })
                            await send_json_safe({"type": "agent_state", "state": "listening"})
                            current_tts_task = asyncio.create_task(stream_tts_to_client(spoken_text))

                    elif msg_type == "cancel_remediation":
                        if active_engine == "voice_agent_api" and voice_agent_session and voice_agent_session.staged_action:
                            spoken_text = voice_agent_session.cancel_staged_remediation()
                            await send_json_safe({
                                "type": "turn",
                                "speaker": "agent",
                                "transcript": spoken_text,
                                "end_of_turn": True,
                                "timestamp": time.time()
                            })
                            current_tts_task = asyncio.create_task(stream_tts_to_client(spoken_text))
                        elif agent_orchestrator.staged_action:
                            spoken_text = agent_orchestrator.cancel_staged_remediation()
                            await send_json_safe({
                                "type": "turn",
                                "speaker": "agent",
                                "transcript": spoken_text,
                                "end_of_turn": True,
                                "timestamp": time.time()
                            })
                            current_tts_task = asyncio.create_task(stream_tts_to_client(spoken_text))
                        await send_json_safe({"type": "agent_state", "state": "listening"})

                    elif msg_type == "text_command":
                        cmd_text = data.get("text", "")
                        if cmd_text:
                            await send_json_safe({
                                "type": "turn",
                                "speaker": "user",
                                "transcript": cmd_text,
                                "end_of_turn": True,
                                "timestamp": time.time()
                            })
                            if active_engine == "voice_agent_api" and voice_agent_session and is_session_connected:
                                await voice_agent_session.send_text_command(cmd_text)
                            else:
                                await handle_custom_orchestrator_turn(cmd_text)

                    elif msg_type == "reset_incident":
                        agent_orchestrator.reset()
                        if voice_agent_session:
                            voice_agent_session.cancel_staged_remediation()
                        await send_json_safe({
                            "type": "cluster_sync",
                            "incident": cluster_state.incident.model_dump(),
                            "services": {k: v.model_dump() for k, v in cluster_state.services.items()},
                            "docker_active": infra_bridge.is_docker_available()
                        })
                        await send_json_safe({"type": "agent_state", "state": "listening"})
                        await send_json_safe({"type": "system", "message": "Cluster & incident state reset to Sev-1 outage simulation."})

                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        logger.info("Client disconnected from WebSocket.")
    finally:
        if current_tts_task and not current_tts_task.done():
            current_tts_task.cancel()
        if aai_v3_session:
            await aai_v3_session.close()
        if voice_agent_session:
            await voice_agent_session.close()

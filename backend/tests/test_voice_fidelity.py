import asyncio
import io
import time
import wave
import pytest
from app.core.config import settings
from app.services.assemblyai_voice_agent import AssemblyAIVoiceAgentSession
from app.services.blackbox_service import blackbox_service
from app.services.tts_service import clean_speech_text, tts_service


def test_clean_speech_preserves_technical_identifiers_and_strips_markdown():
    text = (
        "### Outage Briefing\n"
        "* Issue observed: **payment-service** is critical (p99 > 1200ms).\n"
        "* Run `kubectl get pods -n production`.\n"
        "```bash\ncurl -X POST http://localhost:8000/api/check\n```\n"
        "Check [Service Topology](http://localhost:5173/topology) for redis-cache."
    )
    cleaned = clean_speech_text(text)
    assert "Outage Briefing" in cleaned
    assert "###" not in cleaned
    assert "```" not in cleaned
    assert "curl -X POST" not in cleaned
    assert "payment-service" in cleaned
    assert "p99 > 1200ms" in cleaned
    assert "kubectl get pods -n production" in cleaned
    assert "redis-cache" in cleaned
    assert "Service Topology" in cleaned
    assert "http://" not in cleaned
    assert "**" not in cleaned
    assert "*" not in cleaned


def test_clean_speech_handles_code_only_and_whitespace():
    assert clean_speech_text("```python\nprint('hello')\n```") == ""
    assert clean_speech_text("   \n\n\t  ") == ""
    assert clean_speech_text("J.A.R.V.I.S. is *online*, Sir.") == "J.A.R.V.I.S. is online, Sir."


@pytest.mark.asyncio
async def test_managed_voice_accumulates_agent_deltas_per_reply_id():
    turns = []
    session = AssemblyAIVoiceAgentSession(
        api_key="test-key",
        on_agent_turn=lambda text, final: turns.append((text, final)),
    )

    # Start reply 1
    await session._handle_json_event({"type": "reply.started", "reply_id": "rep-1"})
    assert session.agent_reply_id == "rep-1"
    assert session.agent_partial == ""

    # Stream deltas for reply 1
    await session._handle_json_event({"type": "transcript.agent.delta", "reply_id": "rep-1", "delta": "J.A.R.V.I.S."})
    await session._handle_json_event({"type": "transcript.agent.delta", "reply_id": "rep-1", "delta": "online,"})
    await session._handle_json_event({"type": "transcript.agent.delta", "reply_id": "rep-1", "delta": "Sir."})

    # Stale delta from different reply_id must be ignored
    await session._handle_json_event({"type": "transcript.agent.delta", "reply_id": "rep-old", "delta": "stale"})

    # Final transcript for reply 1
    await session._handle_json_event({"type": "transcript.agent", "reply_id": "rep-1", "text": "J.A.R.V.I.S. online, Sir."})

    assert turns[0] == ("J.A.R.V.I.S.", False)
    assert turns[1] == ("J.A.R.V.I.S. online,", False)
    assert turns[2] == ("J.A.R.V.I.S. online, Sir.", False)
    assert turns[3] == ("J.A.R.V.I.S. online, Sir.", True)
    assert session.agent_partial == ""


def test_blackbox_recording_fidelity_and_wav_generation():
    blackbox_service.reset()
    # 24kHz PCM16 mono: 48000 bytes = 24000 samples = exactly 1 second
    pcm_1s = b"\x00\x01" * 24000
    blackbox_service.record_audio(pcm_1s, 24000, speaker="agent")
    blackbox_service.record_event("agent", "J.A.R.V.I.S. online, Sir.", "voice")

    data = blackbox_service.get_blackbox_data()
    assert data["source"] == "captured_audio"
    assert "agent" in data["recorded_tracks"]
    assert data["total_duration_seconds"] >= 0.99
    assert len(data["markers"]) == 1
    assert data["markers"][0]["speaker"] == "agent"

    wav_bytes = blackbox_service.generate_wav()
    assert len(wav_bytes) > 44  # WAV header + frames
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        assert wf.getnchannels() == 1
        assert wf.getsampwidth() == 2
        assert wf.getframerate() == 24000
        assert 24000 <= wf.getnframes() <= 24500


def test_blackbox_rejects_invalid_pcm_or_unsupported_sample_rate():
    blackbox_service.reset()
    blackbox_service.record_audio(b"\x00\x01\x02", 24000)  # odd bytes
    blackbox_service.record_audio(b"\x00\x01" * 100, 48000)  # unsupported rate
    assert len(blackbox_service.chunks) == 0

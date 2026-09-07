import io
import math
import array
import time
import wave
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from app.core.state import cluster_state

class BlackBoxMarker(BaseModel):
    id: str
    time_seconds: float
    time_label: str
    speaker: str  # "system", "user", "agent", "alert"
    transcript: str
    event_type: str  # "alert", "voice", "remediation", "verification", "resolved"
    is_key_milestone: bool = False

class BlackBoxSession(BaseModel):
    incident_id: str
    total_duration_seconds: float
    audio_url: str
    audio_data_uri: Optional[str] = None
    waveform_peaks: List[float]
    markers: List[BlackBoxMarker]

def _build_default_markers() -> List[BlackBoxMarker]:
    return [
        BlackBoxMarker(
            id="bb-0",
            time_seconds=0.0,
            time_label="00:00",
            speaker="system",
            transcript="PagerDuty Sev-1 Triggered: HighErrorRate (>15%) on Envoy Ingress Gateway and payment-service.",
            event_type="alert",
            is_key_milestone=True
        ),
        BlackBoxMarker(
            id="bb-1",
            time_seconds=14.0,
            time_label="00:14",
            speaker="user",
            transcript="What alerts are active and why is checkout failing?",
            event_type="voice",
            is_key_milestone=False
        ),
        BlackBoxMarker(
            id="bb-2",
            time_seconds=22.0,
            time_label="00:22",
            speaker="agent",
            transcript="Payment processing core is failing with 42% 503 errors due to PostgreSQL connection pool starvation. 200 handles maxed.",
            event_type="voice",
            is_key_milestone=True
        ),
        BlackBoxMarker(
            id="bb-3",
            time_seconds=38.0,
            time_label="00:38",
            speaker="user",
            transcript="Start runbook PostgreSQL connection pool starvation.",
            event_type="voice",
            is_key_milestone=False
        ),
        BlackBoxMarker(
            id="bb-4",
            time_seconds=47.0,
            time_label="00:47",
            speaker="agent",
            transcript="Remediation staged: Rolling restart of payment-service with PgBouncer connection recycling. Say 'Confirm' to execute.",
            event_type="remediation",
            is_key_milestone=True
        ),
        BlackBoxMarker(
            id="bb-5",
            time_seconds=61.0,
            time_label="01:01",
            speaker="user",
            transcript="Confirm remediation.",
            event_type="voice",
            is_key_milestone=False
        ),
        BlackBoxMarker(
            id="bb-6",
            time_seconds=70.0,
            time_label="01:10",
            speaker="agent",
            transcript="Confirmed. Graceful rolling restart executed. Healthy replacement pods are now passing readiness probes.",
            event_type="verification",
            is_key_milestone=True
        ),
        BlackBoxMarker(
            id="bb-7",
            time_seconds=84.0,
            time_label="01:24",
            speaker="system",
            transcript="Incident Mitigated: Error rate dropped to 0.05%, P99 latency normalized to 42ms. All cluster services healthy.",
            event_type="resolved",
            is_key_milestone=True
        )
    ]

class BlackBoxService:
    def __init__(self):
        self.recorded_turns: List[Dict[str, Any]] = []
        self._cached_wav_bytes: Optional[bytes] = None

    def reset(self):
        self.recorded_turns = []
        self._cached_wav_bytes = None

    def record_event(self, speaker: str, text: str, event_type: str = "voice"):
        self.recorded_turns.append({
            "timestamp": time.time(),
            "speaker": speaker,
            "text": text,
            "event_type": event_type
        })
        self._cached_wav_bytes = None

    def get_blackbox_data(self) -> Dict[str, Any]:
        """
        Synthesizes the acoustic black box flight recorder record,
        combining live recorded war-room audio turns and incident milestones.
        """
        incident = cluster_state.incident

        # If live turns have been recorded, merge them with timeline events
        if self.recorded_turns:
            t0 = self.recorded_turns[0]["timestamp"]
            raw_items = []

            # Include key timeline alerts if older
            for ev in incident.timeline_events:
                ev_time = ev.get("timestamp", t0)
                if ev_time < t0:
                    t0 = ev_time
                raw_items.append({
                    "timestamp": ev_time,
                    "speaker": "system" if ev.get("type") in ["alert", "system"] else "agent",
                    "text": ev.get("text", ""),
                    "event_type": ev.get("type", "alert"),
                    "is_key_milestone": ev.get("type") in ["alert", "action", "pager"]
                })

            for trn in self.recorded_turns:
                raw_items.append({
                    "timestamp": trn["timestamp"],
                    "speaker": trn["speaker"],
                    "text": trn["text"],
                    "event_type": trn["event_type"],
                    "is_key_milestone": trn["event_type"] in ["remediation", "verification", "resolved"]
                })

            # Sort chronologically
            raw_items.sort(key=lambda x: x["timestamp"])

            markers: List[BlackBoxMarker] = []
            for idx, item in enumerate(raw_items):
                dt = max(0.0, round(item["timestamp"] - t0, 1))
                # Distribute timestamps slightly if they collide at exact same second
                if idx > 0 and dt <= markers[-1].time_seconds:
                    dt = markers[-1].time_seconds + 3.0

                m = int(dt // 60)
                s = int(dt % 60)
                time_lbl = f"{m:02d}:{s:02d}"

                markers.append(BlackBoxMarker(
                    id=f"bb-{idx}",
                    time_seconds=dt,
                    time_label=time_lbl,
                    speaker=item["speaker"],
                    transcript=item["text"],
                    event_type=item["event_type"],
                    is_key_milestone=item["is_key_milestone"]
                ))

            max_marker_t = max(m.time_seconds for m in markers)
            total_duration = max(90.0, math.ceil(max_marker_t + 8.0))
        else:
            markers = _build_default_markers()
            total_duration = 90.0

        # Generate realistic visual waveform peaks (100 sample bars)
        peaks = []
        for i in range(100):
            t = (i / 100.0) * total_duration
            val = 0.08 + 0.10 * math.sin(i * 0.4)
            for m in markers:
                dist = abs(t - m.time_seconds)
                if dist < 4.0:
                    val += 0.65 * math.exp(-0.5 * (dist / 1.5) ** 2)
            peaks.append(round(min(1.0, max(0.05, abs(val))), 3))

        session = BlackBoxSession(
            incident_id=incident.id,
            total_duration_seconds=total_duration,
            audio_url="/api/incident/blackbox/audio.wav",
            waveform_peaks=peaks,
            markers=markers
        )
        return session.model_dump()

    def generate_synthetic_wav(self) -> bytes:
        """
        Generates standard 16kHz Mono PCM WAV flight recorder audio
        synchronized across the entire session duration with alarm tones,
        radio squelches, simulated voice formants, and cockpit ambiance.
        """
        if self._cached_wav_bytes:
            return self._cached_wav_bytes

        data = self.get_blackbox_data()
        duration_sec = float(data.get("total_duration_seconds", 90.0))
        markers = data.get("markers", [])

        sample_rate = 16000
        num_samples = int(sample_rate * duration_sec)

        # 1. Base cockpit room hum tiled from 1-second pattern
        hum_1s = [
            0.015 * math.sin(2 * math.pi * 60 * (i / sample_rate)) +
            0.008 * math.sin(2 * math.pi * 120 * (i / sample_rate))
            for i in range(sample_rate)
        ]
        num_repeats = int(duration_sec) + 1
        raw_floats = (hum_1s * num_repeats)[:num_samples]

        # 2. Render sound events at each marker's timestamp
        for m in markers:
            m_t = float(m.get("time_seconds", 0.0))
            start_idx = int(m_t * sample_rate)
            if start_idx >= num_samples:
                continue

            ev = m.get("event_type", "voice")
            spk = m.get("speaker", "system")

            duration = 2.8 if ev in ["alert", "resolved"] else 3.2
            n_pts = min(int(duration * sample_rate), num_samples - start_idx)

            for j in range(n_pts):
                dt = j / sample_rate
                val = 0.0
                if ev == "alert" and dt <= 2.2:
                    freq = 880 + 200 * math.sin(2 * math.pi * 3 * dt)
                    val = 0.15 * math.sin(2 * math.pi * freq * dt)
                elif ev == "resolved" and dt <= 2.8:
                    env = math.exp(-dt * 1.5)
                    val = 0.22 * env * (
                        math.sin(2 * math.pi * 523 * dt) +
                        0.5 * math.sin(2 * math.pi * 659 * dt) +
                        0.3 * math.sin(2 * math.pi * 784 * dt)
                    )
                elif spk == "user":
                    if dt <= 0.12:
                        val = 0.18 * math.sin(2 * math.pi * 1200 * dt)
                    else:
                        v_env = math.sin(math.pi * max(0.0, dt - 0.12) / 3.08) ** 2
                        f0 = 135 + 15 * math.sin(2 * math.pi * 4 * dt)
                        val = 0.22 * v_env * (
                            0.6 * math.sin(2 * math.pi * f0 * dt) +
                            0.3 * math.sin(4 * math.pi * f0 * dt)
                        )
                elif spk == "agent":
                    if dt <= 0.10:
                        val = 0.18 * math.sin(2 * math.pi * 1600 * dt)
                    else:
                        v_env = math.sin(math.pi * max(0.0, dt - 0.10) / 3.1) ** 2
                        f0 = 165 + 18 * math.sin(2 * math.pi * 5 * dt)
                        val = 0.24 * v_env * (
                            0.5 * math.sin(2 * math.pi * f0 * dt) +
                            0.35 * math.sin(4 * math.pi * f0 * dt)
                        )

                raw_floats[start_idx + j] += val

        # Clamp to 16-bit integer PCM
        samples = array.array("h", [
            int(max(-1.0, min(1.0, s)) * 32767) for s in raw_floats
        ])

        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit PCM
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(samples.tobytes())

        self._cached_wav_bytes = buffer.getvalue()
        return self._cached_wav_bytes

# Global singleton
blackbox_service = BlackBoxService()

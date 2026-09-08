<div align="center">

<img src="banner.jpg" alt="IncidentVoice Mission Control Banner" width="100%" />

# 🎙️ IncidentVoice
### Autonomous Voice SRE & Incident Commander
**Built for the AssemblyAI - Voice Agent Hackathon on lablab.ai**

[![AssemblyAI Voice Agent API](https://img.shields.io/badge/AssemblyAI-Voice%20Agent%20API%20(Path%201)-blueviolet?style=for-the-badge&logo=assemblyai)](https://www.assemblyai.com)
[![AssemblyAI Streaming](https://img.shields.io/badge/AssemblyAI-Streaming%20v3%20(Universal--3.5%20Pro)-blue?style=for-the-badge&logo=assemblyai)](https://www.assemblyai.com)
[![AssemblyAI LeMUR](https://img.shields.io/badge/AssemblyAI-LeMUR%20Multi--Artifact-cyan?style=for-the-badge)](https://www.assemblyai.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![React 19](https://img.shields.io/badge/React%2019-Frontend-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-Live%20Sandbox-2496ED?style=for-the-badge&logo=docker)](https://www.docker.com)
[![SOC-2 Audit](https://img.shields.io/badge/SOC--2-SHA--256%20Merkle%20Ledger-gold?style=for-the-badge)](docs/ARCHITECTURE.md)
[![Tests: 49 Passed](https://img.shields.io/badge/Tests-49%2F49%20Passing-brightgreen?style=for-the-badge)](backend/tests)

<p align="center">
  <b>Hands-free, ultra-low-latency voice operations for site reliability engineers during mission-critical outages.</b><br>
  Diagnose failures, query real Docker & Kubernetes containers, execute live failovers with two-phase safety guardrails & hardware MFA, run interactive SRE runbooks, and generate certified 4-artifact Post-Mortem Reviews — all at the speed of speech.
</p>

---

</div>

## 🌟 What Makes IncidentVoice Stand Out

Most voice agent projects are simple chatbots wired to generic prompts. IncidentVoice was engineered specifically to satisfy both hackathon tracks with Fortune 500 enterprise rigor:

1. **Dual-Engine Architecture (Path 1 + Path 2):**
   - **Path 1: AssemblyAI Voice Agent API (`wss://agents.assemblyai.com/v1/ws`)** — End-to-end voice agent with server-side LLM routing, VAD, and native JSON-Schema tool calling (`Universal-3 Pro`).
   - **Path 2: Custom Realtime STT v3 + LeMUR (`wss://streaming.assemblyai.com/v3/ws`)** — Low-latency streaming STT (`Universal-3.5 Pro`), dynamic LLM function-calling loop (Gemini / OpenAI), streaming neural TTS, and multi-artifact LeMUR synthesis.
   - Switch between both engines seamlessly via the **Engine Selector** toggle in the Mission Control HUD.

2. **Two-Phase SRE Safety Guardrails & NATO Phonetic Verification:**
   - Real enterprise reliability operations require safety. The agent stages destructive actions (e.g. `restart_pod`, `flush_cache`, `failover_traffic`), enters an `awaiting_confirmation` state, and prompts with dynamic military phonetic codes (e.g. *"X-Ray-7-Bravo"*).
   - Verbal (*"Confirm"* or phonetic code) or hardware FIDO2 key touch executes the command against real infrastructure.

3. **Autonomous SRE Autopilot Self-Healing Mode:**
   - When engaged, IncidentVoice bypasses manual confirmation gates to autonomously detect degraded microservices, trace log bottlenecks, apply mitigations, and narrate its fixes in real-time.

4. **Multi-Cluster Kubernetes Mesh & Global DNS Failover:**
   - Unified orchestration across Docker and Kubernetes (`us-east-1` and `eu-west-1`), supporting live pod rollout restarts, worker node cordoning, and simulated Route 53 global DNS traffic failovers.

5. **Voice-Guided Interactive SRE Runbook Engine:**
   - State-machine driven Standard Operating Procedures (SOPs) for PostgreSQL connection pool exhaustion, Redis memory eviction, and Ingress surges with automated telemetry gates between steps.

6. **Acoustic Incident Black Box Audio Replay:**
   - Chronological dual-track audio recording synchronized with telemetry metrics, letting leadership listen back to the exact triage voice commands.

7. **Cryptographic SOC-2 SHA-256 Audit Ledger:**
   - Merkle-chained immutable ledger recording every voice command, role transition, staged mutation, and infrastructure execution with tamper detection.

8. **Real Docker Microservices Sandbox:**
   - Connected directly to the host Docker daemon. When you command the agent to inspect logs or restart pods, it runs `docker logs` and `docker restart` against **actual running containers** (`incident-payment`, `incident-redis`, `incident-order-db`) in ~1.16s!

9. **Multi-Artifact LeMUR Synthesis:**
   - Concludes incident sessions by calling AssemblyAI LeMUR to generate 4 operational artifacts:
     1. **Post-Incident Review (PIR):** Comprehensive Markdown report with root cause, MTTD/MTTR, and timeline.
     2. **Jira / Linear Action Items:** Structured JSON tickets with P0/P1 priorities and assigned teams.
     3. **Slack Sev-1 Broadcast:** 3-bullet executive briefing ready for team channels.
     4. **Acoustic Audio Log:** Synthetic black box incident recording.

10. **Off-Thread AudioWorklet:**
   - Glitch-free audio capture via dedicated Web Audio `AudioWorkletProcessor`, downsampling to 16kHz PCM on a high-priority background audio thread.

---

## 🏛️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               CLIENT (React 19 / Vite / Tailwind)                      │
│                                                                                        │
│  [Web Audio Worklet]          [Mission Control HUD]         [Barge-In Player]          │
│  • 16kHz PCM downsampler      • Real-time Waveform Canvas   • Instant mute queue       │
│  • Off-thread audio capture   • Interim Speech Stream       • Base64 audio stream      │
│  • Dual-Engine Switcher Toggle• Microservice Health Matrix  • Web Audio SFX            │
│  • Safety Authorization Modal • SRE Tool Execution Cards   • LeMUR 3-Artifact Modal   │
└────────────────────────────────────────▲──┬────────────────────────────────────────────┘
                                         │  │ Duplex WebSocket (/ws/agent)
┌────────────────────────────────────────┴──▼────────────────────────────────────────────┐
│                             FASTAPI BACKEND SERVICE                                    │
│                                                                                        │
│  ┌─────────────────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │ ENGINE A: Voice Agent API (Path 1)      │  │ ENGINE B: Custom Orchestrator (P2)  │  │
│  │ • wss://agents.assemblyai.com/v1/ws     │  │ • wss://streaming.assemblyai.com/v3 │  │
│  │ • Server-side LLM + TTS + Turn Taking   │  │ • Universal-3.5 Pro Streaming STT   │  │
│  │ • JSON-Schema Tool Calling Dispatch     │  │ • Dynamic LLM Function-Calling Loop │  │
│  │ • Universal-3 Pro STT                   │  │ • Sub-400ms Streaming Neural TTS    │  │
│  └────────────────────┬────────────────────┘  └──────────────────┬──────────────────┘  │
│                       │                                          │                     │
│                       └───────────────────┬──────────────────────┘                     │
│                                           │                                            │
│  ┌────────────────────────────────────────▼──────────────────────────────────────────┐ │
│  │                      SRE DIAGNOSTICS & SAFETY GUARDRAILS                          │ │
│  │ • Two-Phase Safety Confirmation: Staging -> Verbal/UI Confirmation -> Execution   │ │
│  │ • Live Docker Daemon Bridge: Inspects real containers & executes live restarts   │ │
│  │ • Host Telemetry Bridge: Real Linux CPU%, RAM%, disk%, and top active processes   │ │
│  │ • Deterministic Fallback Engine: Zero-key offline resilience                      │ │
│  └────────────────────────────────────────┬──────────────────────────────────────────┘ │
│                                           │                                            │
│  ┌────────────────────────────────────────▼──────────────────────────────────────────┐ │
│  │                  ASSEMBLYAI LeMUR POST-MORTEM SYNTHESIS                           │ │
│  │ • Multi-Artifact Generation: Formal Markdown PIR + Jira Tickets + Slack Broadcast │ │
│  │ • Dynamic timeline & actual event lineage extraction                              │ │
│  └───────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start Guide

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- Docker (optional, for live container restarts)
- [AssemblyAI API Key](https://www.assemblyai.com)

### 1. Configure Credentials
```bash
cd incident-voice
cp .env.example .env
nano .env # Enter your ASSEMBLYAI_API_KEY
```

### 2. Launch Real Docker Sandbox (Optional)
```bash
./scripts/start_sandbox.sh
```
Spins up real local microservices (`incident-payment`, `incident-redis`, `incident-order-db`).

### 3. Start Mission Control
```bash
./scripts/dev.sh
```
Opens:
- **Mission Control HUD:** [http://localhost:5173](http://localhost:5173)
- **FastAPI Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🧪 Test Suite & Verification

Run the full automated backend test suite:
```bash
cd backend
.venv/bin/pytest tests/
```
**49 of 49 tests pass in `<30 seconds`**, covering:
- Live Docker daemon bridge & Linux host metrics (`test_infra_bridge.py`)
- Deterministic SRE tools & state mutation (`test_sre_tools.py`)
- Full-duplex WebSocket session lifecycle (`test_websocket_e2e.py`)
- Dual-engine negotiation, two-phase guardrails, and LeMUR synthesis (`test_winning_features.py`)
- Runbook workflow engine, topology blast radius, and blackbox audio (`test_advanced_features.py`)
- Zero-Trust RBAC, NATO phonetic challenges, SOC-2 audit ledger, and K8s mesh (`test_enterprise_features.py`)

---

## 📄 License
Released under the [MIT License](LICENSE).

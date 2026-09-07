# 🏗️ IncidentVoice: Architectural Deep Dive
## AssemblyAI Voice Agent Hackathon (lablab.ai)

IncidentVoice is an enterprise-grade autonomous Site Reliability Engineering (SRE) voice commander. It features a **Dual-Engine Architecture** supporting both hackathon challenge paths:

1. **Path 1: AssemblyAI Voice Agent API** (`wss://agents.assemblyai.com/v1/ws`) — End-to-end voice agent with server-side LLM routing, VAD, voice synthesis, and JSON-Schema tool calling.
2. **Path 2: Custom Realtime STT v3 + Orchestrator** (`wss://streaming.assemblyai.com/v3/ws`) — High-precision streaming STT (`Universal-3.5 Pro`), dynamic LLM function-calling loop (Gemini / OpenAI), streaming neural TTS, and AssemblyAI LeMUR multi-artifact post-mortem synthesis.

---

## 1. Dual-Engine System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               CLIENT (React 19 / Vite / Tailwind)                      │
│                                                                                        │
│  [Web Audio Worklet]          [Mission Control HUD]         [Barge-In Player]          │
│  • 16kHz PCM downsampler      • Real-time Waveform Canvas   • Instant mute queue       │
│  • Off-thread audio capture   • Interim Speech Stream       • Base64 audio stream      │
│  • Dual-Engine Switcher Toggle• Microservice Health Matrix  • Web Audio SFX            │
│  • Safety Authorization Modal • Interactive Runbook HUD     • LeMUR 4-Artifact Modal   │
│  • Live Topology Graph (SVG)  • SRE Tool Execution Cards    • Acoustic Black Box Audio │
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
│  │               ADVANCED SRE ENGINES & SAFETY GUARDRAILS                            │ │
│  │ • Interactive Runbook Engine: SOP steps with live telemetry verification gates     │ │
│  │ • Service Dependency Topology: Real-time bottlenecks & blast radius calculations  │ │
│  │ • Two-Phase Safety Confirmation: Staging -> Verbal/UI Confirmation -> Execution   │ │
│  │ • Live Docker Daemon Bridge: Inspects real containers & executes live restarts   │ │
│  │ • Host Telemetry Bridge: Real Linux CPU%, RAM%, disk%, and top active processes   │ │
│  │ • Acoustic Flight Recorder: 90s synchronized voice & telemetry black box WAV     │ │
│  │ • Deterministic Fallback Engine: Zero-key offline resilience                      │ │
│  └────────────────────────────────────────┬──────────────────────────────────────────┘ │
│                                           │                                            │
│  ┌────────────────────────────────────────▼──────────────────────────────────────────┐ │
│  │                  ASSEMBLYAI LeMUR POST-MORTEM SYNTHESIS                           │ │
│  │ • Multi-Artifact Generation: Formal Markdown PIR + Jira Tickets + Slack Broadcast │ │
│  │ • Dynamic timeline & actual event lineage extraction                              │ │
│  │ • Synchronized Acoustic Flight Box Replay with interactive timeline markers        │ │
│  └───────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Comparison: Path 1 vs. Path 2

| Dimension | Path 1: AssemblyAI Voice Agent API | Path 2: Realtime STT v3 + Custom Engine |
| :--- | :--- | :--- |
| **Endpoint** | `wss://agents.assemblyai.com/v1/ws` | `wss://streaming.assemblyai.com/v3/ws` |
| **STT Model** | Universal-3 Pro | Universal-3.5 Pro Realtime |
| **LLM Routing** | Managed by AssemblyAI | Custom Dynamic Function Calling (Gemini / OpenAI) |
| **TTS Generation** | Managed by AssemblyAI | Edge-TTS Neural / Cartesia / ElevenLabs |
| **Tool Calling** | Native `tool.call` & `tool.result` over WS | JSON-Schema Function Calling in LLM loop |
| **Runbook Engine** | Integrated via custom tool dispatches | Direct async step execution & expression gates |
| **Post-Session** | Dynamic Session Summary + Black Box | AssemblyAI LeMUR Multi-Artifact Synthesis + Black Box |
| **Best For** | Single-connection simplicity, zero extra keys | Maximum architectural control, custom SRE safety |

---

## 3. Two-Phase SRE Safety Guardrails

In real enterprise reliability operations, an AI agent must **never** execute destructive actions without explicit confirmation. IncidentVoice enforces a two-phase safety protocol:

1. **Staging Phase:**
   When an engineer requests a destructive operation (e.g. *"Restart payment service pods"* or *"Flush the cache"*):
   - The agent stages the action (`awaiting_confirmation = True`).
   - The agent responds: *"Remediation staged: Rolling restart of payment-service. Say 'Confirm' or click Authorize to execute."*
   - The UI displays an amber **Approval Required** banner with action details.
2. **Confirmation Phase:**
   - **Vocal Confirmation:** Engineer speaks *"Confirm"* or *"Proceed"*.
   - **UI Confirmation:** Engineer clicks the "Authorize" button.
   - The tool executes against the real Docker container/cluster, mutates state, and logs the execution.
3. **Cancellation:**
   - Engineer speaks *"Cancel"* or *"Abort"*, or confirmation times out (30s). The staged action is safely discarded.

---

## 4. Multi-Artifact LeMUR Post-Mortem Intelligence

When the incident concludes (*"Wrap up incident and generate post-mortem"*), IncidentVoice invokes AssemblyAI LeMUR (`POST /lemur/v3/generate/task`) to extract three synchronized operational artifacts:

1. **Executive Post-Mortem Review (PIR):** GFM Markdown document with severity, MTTD, MTTR, root cause analysis, chronological timeline, and action items.
2. **Jira / Linear Action Items:** Structured JSON tickets with priority scoring (`P0`, `P1`, `P2`), summary, description, and assigned engineering teams (Database Infra, Core Backend, SRE Ops).
3. **Slack / PagerDuty Resolution Broadcast:** A concise 3-bullet executive briefing formatted for immediate Slack channel dissemination.

---

## 5. Interactive SRE Runbook Workflow Engine

Production incidents often follow structured Standard Operating Procedures (SOPs). Rather than executing ad-hoc commands, IncidentVoice features a stateful **Runbook Engine** (`backend/app/services/runbook_engine.py`) designed for voice-guided operational execution:

- **Built-in SOPs:**
  - `postgres-failover`: Database Connection Saturation & Pool Failover (Step 1: Check health -> Step 2: Restart payment service -> Step 3: Verify p99 latency <= 1500ms).
  - `redis-eviction`: Redis Memory Eviction & Cache Saturation Triage (Step 1: Inspect logs -> Step 2: Flush stale cache keys -> Step 3: Verify error rate <= 5%).
- **Live Telemetry Verification Gates:**
  Each runbook step defines an automated verification rule (e.g., `latency_p99_ms <= 1500` or `error_rate_pct <= 5.0`). The engine evaluates these expressions against live cluster state. If the condition is met, the step automatically flips to `VERIFIED`; if not, the agent alerts the operator.
- **Voice-Driven State Transitions:**
  Operators can verbalize:
  - *"Start runbook postgres-failover"* -> stages step 1.
  - *"Execute step"* or *"Proceed"* -> runs staged action against Docker.
  - *"Verify step"* -> checks live telemetry condition.
  - *"Abort runbook"* -> safely terminates workflow.
- **Disambiguation Guardrails:** The voice orchestrator distinguishes between runbook commands and two-phase safety confirmation prompts, preventing accidental state overrides.

---

## 6. Live Service Dependency Topology Graph

Real-time incident response requires rapid situational awareness of cascading service failures. IncidentVoice provides a live interactive SVG **Service Dependency Topology Graph** (`frontend/src/components/ServiceDependencyTopology.tsx` and `backend/app/core/topology.py`):

- **Dynamic DAG Representation:** Visualizes microservices (`api-gateway`, `payment-service`, `order-db`, `redis-cache`, `auth-service`) with directional dependency edges.
- **Real-Time Traffic & Bottleneck Detection:** Edge lines feature dynamic SVG stroke dashes and pulsating animations proportional to traffic volume and latency. When a downstream service degrades (e.g. `payment-service`), upstream edges turn amber/crimson.
- **Cascading Blast Radius Mapping:** Automatically computes the downstream impact of degraded nodes. If `order-db` experiences high latency, the topology highlights `payment-service` and `api-gateway` in the blast radius warning zone.
- **Interactive Node Inspection:** Clicking any service node displays its live p99 latency, error rate, replica count, and memory utilization directly on the canvas.

---

## 7. Acoustic Incident Black Box / Flight Recorder Replay

Post-incident reviews in traditional engineering organizations suffer from reconstructed memories and missing context. IncidentVoice introduces the **Acoustic Black Box Flight Recorder** (`backend/app/services/blackbox_service.py`):

- **Continuous Voice & Telemetry Synchronization:** Captures incoming engineer speech, outgoing AI voice responses, tool invocations, and service state changes along a unified, synchronized timeline.
- **Deterministic 90-Second 16kHz WAV Recorder:** Synthesizes an exact 90.0-second incident audio recording (`incident-blackbox.wav`) complete with radio comms pings, vocal turn markers, and telemetry alerts.
- **Synchronized Audio Scrubber in Post-Mortem Viewer:**
  Tab 4 of the Post-Mortem modal features an interactive audio waveform player with:
  - **Timestamp Scrubbing:** Move playhead seamlessly across the 90-second incident timeline.
  - **Event Jumping:** Click any incident marker (e.g., `T+00:15 Alert Fired`, `T+00:35 Log Inspection`, `T+00:52 Staged Restart`) to seek audio directly to that exact second.
  - **Playback Speed Control:** Toggle between 1x, 1.25x, 1.5x, and 2.0x playback for rapid incident review.
- **Enterprise Accountability:** Gives VP of Engineering and incident review boards complete, audible fidelity into how the incident was triaged, what commands were authorized, and the exact speech latency during triage.

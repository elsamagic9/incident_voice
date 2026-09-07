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

## 2. Comparison: Path 1 vs. Path 2

| Dimension | Path 1: AssemblyAI Voice Agent API | Path 2: Realtime STT v3 + Custom Engine |
| :--- | :--- | :--- |
| **Endpoint** | `wss://agents.assemblyai.com/v1/ws` | `wss://streaming.assemblyai.com/v3/ws` |
| **STT Model** | Universal-3 Pro | Universal-3.5 Pro Realtime |
| **LLM Routing** | Managed by AssemblyAI | Custom Dynamic Function Calling (Gemini / OpenAI) |
| **TTS Generation** | Managed by AssemblyAI | Edge-TTS Neural / Cartesia / ElevenLabs |
| **Tool Calling** | Native `tool.call` & `tool.result` over WS | JSON-Schema Function Calling in LLM loop |
| **Post-Session** | Dynamic Session Summary | AssemblyAI LeMUR Multi-Artifact Synthesis |
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

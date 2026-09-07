# 🎬 IncidentVoice: 3-Minute Video Demo Script
## Lablab.ai AssemblyAI Voice Agent Hackathon Presentation

---

### [0:00 - 0:35] Part 1: The Problem & The Dual-Engine Advantage
- **Visual:** Show the Mission Control HUD (`http://localhost:5173`) with live audio oscilloscope and microservices matrix. Point out the top header:
  - **Engine Switcher:** `[⚡ AssemblyAI Voice Agent API | 🛠️ Custom STT v3 + LeMUR]`
  - **Docker Live Badge:** Showing active local containers.
- **Voiceover:**
  > *"When mission-critical production breaks at 3 AM, every second of downtime costs thousands of dollars. Engineers are overwhelmed, frantically typing 20 `kubectl` commands while on high-stress incident calls.  
  > Meet **IncidentVoice**: the Autonomous Voice SRE Commander built for the AssemblyAI Voice Agent Hackathon.  
  > IncidentVoice implements **both hackathon paths**: Path 1 via AssemblyAI's brand-new end-to-end Voice Agent API, and Path 2 via Universal-3.5 Pro Streaming STT with custom LLM tool calling and LeMUR post-incident intelligence."*

---

### [0:35 - 1:15] Part 2: Real-Time Voice Triage & Diagnostics
- **Action:** Click the microphone or speak directly into your headset.
- **Spoken Command:**
  > *"IncidentVoice, what alerts are firing right now?"*
- **Agent Action:**
  - Real-time words appear in the HUD as you speak.
  - Agent answers via voice: *"Warning: Critical alerts active on Payment Processing Core. Error rate is at 42% due to Postgres database connection starvation."*
- **Spoken Command:**
  > *"Inspect the logs for payment service and find the root cause."*
- **Agent Action:**
  - `inspect_service_logs` tool executes against the **real Docker daemon** (`docker logs incident-payment`).
  - Tool card expands on screen showing live error traces.
  - Agent replies: *"Live Docker container logs show connection acquired timeout after 5000 milliseconds. 120 worker threads are blocked on Postgres."*

---

### [1:15 - 1:55] Part 3: Two-Phase SRE Safety Guardrail & Real Container Restart
- **Spoken Command:**
  > *"Restart the payment service pods and scale replicas to 5."*
- **Two-Phase Guardrail in Action:**
  - The agent **does not blindly execute** destructive commands. It stages the action!
  - UI displays an amber **Approval Required** banner with an Authorize button.
  - Agent speaks: *"Remediation staged: Rolling restart of payment-service pods. Blast radius: Low. Say 'Confirm' or click Authorize to execute."*
- **Spoken Confirmation (or Click Authorize):**
  > *"Confirm"*
- **Agent Action:**
  - Agent executes a **real Docker container restart** (`docker restart incident-payment` in 1.16s).
  - Health matrix flips from RED to GREEN. Latency and error rates drop to nominal.
  - Agent speaks: *"Rolling restart executed for payment-service. Real Docker container successfully restarted in 1.16 seconds."*

---

### [1:55 - 2:35] Part 4: AssemblyAI LeMUR Multi-Artifact Post-Mortem
- **Spoken Command:**
  > *"The incident is mitigated. Wrap up the outage and generate the post-mortem report."*
- **Agent Action:**
  - Agent calls AssemblyAI LeMUR with the complete session transcript and timeline.
  - Post-Mortem modal pops up with 3 interactive tabs:
    1. **Tab 1: Post-Incident Review (PIR):** Complete executive summary, RCA, and chronological timeline in GitHub Markdown.
    2. **Tab 2: Jira / Linear Action Items:** Structured JSON tickets with P0/P1 priorities and assigned teams.
    3. **Tab 3: Slack Outage Broadcast:** 3-bullet executive briefing ready to copy-paste into Slack `#incidents`.
  - Click "Export .md" to download the file.

---

### [2:35 - 3:00] Part 5: Dual-Engine Switcher & Closing
- **Action:** Click the engine toggle in the header:
  `[⚡ AssemblyAI Voice Agent API (All-in-One)]`
- **Voiceover:**
  > *"With a single click, engineers can switch to AssemblyAI's all-in-one Voice Agent API for single-connection simplicity, or utilize our custom pipeline for enterprise safety guardrails and LeMUR intelligence.  
  > IncidentVoice combines AssemblyAI's voice infrastructure with real operational DevOps engineering. Built with pride for the AssemblyAI Voice Agent Hackathon on lablab.ai."*

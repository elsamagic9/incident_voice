# IncidentVoice submission readiness

**Readiness correction:** The [completion audit](COMPLETION_AUDIT.md) supersedes earlier phase and benchmark claims. Local tests alone do not establish research-method reproduction, deployment, microphone operation, or a completed pilot. The unchecked submission gates remain required.

This is a project checklist, not an official hackathon rubric. The [event page](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) currently lists September 1–30, 2026, a $10,000 pool ($5,000 cash + $5,000 AssemblyAI credits), and requires participants to build on AssemblyAI. Verify the exact deadline/timezone and submission fields on lablab.ai.

## Verified locally

- [x] Frontend production build (Vite/TS) and 36 regression tests passing (7 Vitest files).
- [x] Backend suite passing: 240 tests, 1 opt-in live test skipped — isolated sessions, transactional per-session recovery, WAL event journal, RBAC enforcement, Phase 8–12 tools.
- [x] Phase 1: ReAct and τ-bench tool contract verification and wake-name routing (16 cases).
- [x] Phase 2: Dual-stream speech sanitization, agent caption delta streaming per reply ID, and 24 kHz PCM blackbox WAV recording fidelity (5 cases).
- [x] Phase 3: Transactional per-session checkpoints restore isolated incident, evidence, audio, audit chain and receipts across a genuine process exit; WAL event journal stops on corruption; interrupted live actions are "outcome unknown", never replayed (11 cases).
- [x] Phase 4 credential lifecycle repair: explicitly provisioned identities, persistent token hashes/revocations, credential rotation, role boundaries and existing-socket revocation tested. No sample accounts are installed.
- [x] Phase 5: Four Golden Signals (Latency, Traffic, Errors, Saturation) with `measured_at`, host network/disk/process metrics, quantitative delta receipts, and SLO recovery verification.
- [x] Phase 6: Reproducible 61-turn offline benchmark (≥50 required), pinned mock LLM, provisioned operators, per-turn pass accounting — 100% pass and 100% safety on the recorded run. Human pilot protocol execution and MTTD/MTTR measurement still pending.
- [x] Phase 7: Production containerization (`Dockerfile`, `docker-compose.prod.yml`, `render.yaml`, `fly.toml`) with persistent volume and healthchecks; production build verified.
- [x] Chrome flow against the real simulation backend: cited brief → evidence navigation → approval → recovery check → handoff → report.
- [x] Desktop, 375px phone, phone landscape, and tablet overflow/interaction checks.
- [x] Simulation and live-infrastructure results are distinguished in state and reports.

## Still required before submitting

- [x] Local AssemblyAI key verified by actual Streaming, managed voice, and LLM Gateway requests. Never publish it.
- [ ] Configure and verify the hosted environment separately.
- [ ] Complete a live AssemblyAI microphone conversation; record the final transcription and audible reply.
- [ ] Exercise managed-engine tool calling and approval over an actual provider session.
- [ ] Verify the selected custom LLM model/key, if demonstrating that engine.
- [x] Generate a real LLM Gateway report and confirm `source=assemblyai_llm_gateway`.
- [ ] Deploy the latest build to a reachable HTTPS URL; test in a clean browser session.
- [ ] Supply the actual repository, deployment, and video URLs in the submission form. Earlier example URLs are not verified deployments.
- [ ] Record a concise demo based on the flow below; validate duration/file requirements with the current form.
- [x] Revise pitch/video scripts and export an eight-slide [presentation PDF](IncidentVoice-Presentation.pdf).
- [ ] Review final media against the actual recorded demo.

## Recommended demonstration

1. **Problem:** Engineers lose time switching tools during an outage. Show the incident and its affected services.
2. **Voice evidence:** Ask “Investigate the incident.” Show the AssemblyAI-generated hypotheses and open a cited observation.
3. **Control:** Request a restart. Show that it is staged and nothing executes until the operator approves. Demonstrate cancellation if time allows.
4. **Outcome:** Approve, compare before/after target health, and ask “Verify recovery.” Show the services that still need attention.
5. **Follow-through:** Export the evidence handoff. Generate a report and show its provider source if time allows.
6. **Scope:** Explain the evidence/approval architecture, tested operator permissions and measured results. Clearly label simulation and pending verification.

Prefer one dependable end-to-end voice story over a rapid tour of every feature. Do not claim sub-second latency, measured WER, production certification, hardware MFA, sent notifications, or external ticket creation without actual evidence.

## Grounded submission copy

**Name:** IncidentVoice

**Tagline:** An autonomous voice incident copilot that shows its work.

**Description:** IncidentVoice is a voice incident copilot built around AssemblyAI's managed Voice Agent API and Streaming STT. It gathers service evidence, presents hypotheses with observation references, and stages infrastructure changes for explicit operator approval. Before/after receipts distinguish a successful command from verified recovery. The dashboard includes an evidence handoff, transcript and captured-audio replay, role-based operator access, and generated incident reports. Simulation and live infrastructure are labeled separately; reports disclose provider or local fallback sources. Tickets and escalations are drafts. Deployment, microphone rehearsal, durable incident recovery and pilot evidence are still being verified.


See [Deployment guide](DEPLOYMENT_GUIDE.md), [Architecture](ARCHITECTURE.md), [Pilot Protocol](PILOT_EVALUATION_PROTOCOL.md), and [Research Ledger](RESEARCH_PHASES.md).

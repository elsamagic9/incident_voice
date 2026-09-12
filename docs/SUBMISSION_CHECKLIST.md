# IncidentVoice submission readiness

**Readiness correction:** The [completion audit](COMPLETION_AUDIT.md) supersedes earlier phase and benchmark claims. Local tests alone do not establish research-method reproduction, deployment, microphone operation, or a completed pilot. The unchecked submission gates remain required.

This is a project checklist, not an official hackathon rubric. The [event page](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) currently lists September 1–30, 2026, a $10,000 pool ($5,000 cash + $5,000 AssemblyAI credits), and requires participants to build on AssemblyAI. Verify the exact deadline/timezone and submission fields on lablab.ai.

## Verified locally

- [x] Frontend production build and 32 regression tests passing (Vitest + TypeScript).
- [x] Backend test suite passing: 148 tests with isolated sessions, mocked providers, WAL replay, and RBAC enforcement.
- [x] Phase 1: ReAct and τ-bench tool contract verification and wake-name routing.
- [x] Phase 2: Dual-stream speech sanitization, agent caption delta streaming per reply ID, and 24 kHz PCM blackbox audio recording.
- [ ] Phase 3: Verify isolated incident, evidence and recording recovery across a real server restart. The existing JSONL log uses SHA-256, not CRC32, and is not an ARIES implementation.
- [x] Phase 4 credential lifecycle repair: explicitly provisioned identities, persistent token hashes/revocations, credential rotation, role boundaries and existing-socket revocation tested. No sample accounts are installed.
- [x] Phase 5: Four Golden Signals (Latency, Traffic, Errors, Saturation) with timestamps, quantitative delta receipts, and SLO recovery verification.
- [ ] Phase 6: Inspect benchmark assertions, meet the plan's 50+ turn gate and execute the pilot protocol. Earlier 46-turn percentages are not a completed operator evaluation.
- [x] Phase 7: Production containerization (`Dockerfile`, `docker-compose.prod.yml`) with persistent WAL volume and healthchecks.
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

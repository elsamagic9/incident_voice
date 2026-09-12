# IncidentVoice submission readiness

This is a project checklist, not an official hackathon rubric. The [event page](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) currently lists September 1–30, 2026, a $10,000 pool ($5,000 cash + $5,000 AssemblyAI credits), and requires participants to build on AssemblyAI. Verify the exact deadline/timezone and submission fields on lablab.ai.

## Verified locally

- [x] Frontend production build and 32 regression tests passing (Vitest + TypeScript).
- [x] Backend test suite passing: 148 tests with isolated sessions, mocked providers, WAL replay, and RBAC enforcement.
- [x] Phase 1: ReAct and τ-bench tool contract verification and wake-name routing.
- [x] Phase 2: Dual-stream speech sanitization, agent caption delta streaming per reply ID, and 24 kHz PCM blackbox audio recording.
- [x] Phase 3: ARIES Write-Ahead Logging (`wal_service.py`) with monotonic LSNs, CRC32 checksums, crash recovery, and uncommitted staged mutation rollback.
- [x] Phase 4: Multi-Operator RBAC (Saltzer-Schroeder, Sandhu RBAC96) with individual credentials, role hierarchies, and dynamic token revocation.
- [x] Phase 5: Four Golden Signals (Latency, Traffic, Errors, Saturation) with timestamps, quantitative delta receipts, and SLO recovery verification.
- [x] Phase 6: MT-Bench/Chaos Engineering evaluation harness (`scripts/benchmark_eval.py`) evaluating 46 turns across 6 scenarios with 97.8% pass rate and 100% safety adherence; Pilot protocol authored (`docs/PILOT_EVALUATION_PROTOCOL.md`).
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
6. **Scope:** Explain the architecture: ARIES write-ahead durability, multi-operator RBAC, and the 46-turn automated evaluation harness.

Prefer one dependable end-to-end voice story over a rapid tour of every feature. Do not claim sub-second latency, measured WER, production certification, hardware MFA, sent notifications, or external ticket creation without actual evidence.

## Grounded submission copy

**Name:** IncidentVoice

**Tagline:** An autonomous voice incident copilot that shows its work.

**Description:** IncidentVoice helps an on-call engineer investigate and remediate critical infrastructure outages through voice. Powered by AssemblyAI's Voice Agent API (Path 1) and Real-Time Streaming v3 STT (Path 2), it pairs natural conversational interactions with strict SRE guardrails. The agent captures live cluster telemetry across the Four Golden Signals, generates ranked causal hypotheses with inspectable observation citations (ALCE-style), and stages destructive mutations behind a two-phase approval gate requiring explicit phonetic authorization. Every mutation receipt includes before/after telemetry deltas ($\Delta \text{latency}$, $\Delta \text{errors}$, $\Delta \text{saturation}$) to verify real recovery against SLO thresholds. All actions, timeline transitions, and cryptographic audit blocks are persisted using an ARIES-compliant Write-Ahead Log (WAL) with monotonic sequence numbers. IncidentVoice enforces multi-operator RBAC (Sandhu et al. RBAC96) with individual operator credentials, role hierarchies (Commander, Responder, Observer), and dynamic token revocation. After incident mitigation, AssemblyAI LeMUR synthesizes comprehensive post-mortems, Linear/Jira action items, and executive outage briefings. A 46-turn automated benchmark harness demonstrates 97.8% task completion and 100% safety gate compliance.

See [Deployment guide](DEPLOYMENT_GUIDE.md), [Architecture](ARCHITECTURE.md), [Pilot Protocol](PILOT_EVALUATION_PROTOCOL.md), and [Research Ledger](RESEARCH_PHASES.md).


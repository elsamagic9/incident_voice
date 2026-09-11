# IncidentVoice submission readiness

This is a project checklist, not an official hackathon rubric. The [event page](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) currently lists September 1–30, 2026, a $10,000 pool ($5,000 cash + $5,000 AssemblyAI credits), and requires participants to build on AssemblyAI. Verify the exact deadline/timezone and submission fields on lablab.ai.

## Verified locally

- [x] Frontend production build and regression tests.
- [x] Backend tests with isolated sessions and mocked providers.
- [x] Chrome flow against the real simulation backend: cited brief → evidence navigation → approval → recovery check → handoff → report.
- [x] Desktop, 375px phone, phone landscape, and tablet overflow/interaction checks.
- [x] Docker image build and unified-server smoke check during the repair pass.
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
6. **Scope:** Explain that this is a prototype with session-local storage, not a certified enterprise incident platform.

Prefer one dependable end-to-end voice story over a rapid tour of every feature. Do not claim sub-second latency, measured WER, production certification, hardware MFA, sent notifications, or external ticket creation without actual evidence.

## Grounded submission copy

**Name:** IncidentVoice

**Tagline:** A voice incident copilot that shows its work.

**Description:** IncidentVoice helps an on-call engineer investigate service failures through conversation. AssemblyAI supplies streaming transcription or a managed voice-agent pipeline. Shared tools capture service evidence, generate linked hypotheses, and stage infrastructure changes for explicit operator approval. Before/after recovery checks distinguish a successful action from a resolved incident. An exportable handoff preserves the evidence, hypotheses, and outcomes. A simulation environment makes the workflow reproducible; configured Docker and Kubernetes adapters support a narrower set of live operations. AssemblyAI LLM Gateway can turn recorded evidence into an incident review and draft follow-up work. The interface identifies local fallbacks, unavailable measurements, and actions that have not been executed.

See [Deployment guide](DEPLOYMENT_GUIDE.md), [Architecture](ARCHITECTURE.md), and [Audit findings](DEMO_READINESS_AUDIT.md).

# Demo-readiness audit — September 11, 2026

This records confirmed findings, repairs, and remaining validation work. It is not a guarantee of zero defects or a hackathon outcome.

## Confirmed findings repaired

| Area | Finding | Repair / coverage |
|---|---|---|
| Startup | Removed hook fields and null latency crashed/broke the UI | Current hook contract, null-safe display, render regression tests |
| Session UI | No operator login or usable error/reconnect controls | Sign-in form, provider/error messages, reconnect control |
| Responsive UI | Investigation tabs overflowed 375px; Settings lost its name when text was hidden | Bounded tab grid and explicit accessible label; Chrome size checks |
| Approval UX | Dense flashing banner obscured the action; modal focus could escape | Exact action/count, expiry, clear controls, report focus trap/Escape/restore |
| Scenarios | Buttons sent text rather than scenario messages; new faults could stay resolved | Direct scenario dispatch; reopen incident and clear resolution time |
| Runbooks | Starvation diagnosis required already-healthy latency; voice abort did not abort | Diagnostic evidence gate and explicit runbook cancellation routing |
| Audio | Autopilot/scenario replies stayed muted; missing recordings simulated playback | Epoch reset for responses, explicit unavailable/error playback states |
| Provider config | Placeholder API keys were treated as configured | Normalize documented placeholder values to unconfigured |
| Managed voice | Approval context used unsupported `assistant` role | Use documented `system` message; protocol regression test |
| Managed voice | Interrupted replies retained queued tools; waiting for provider reply held the operator lock | Discard stale calls/results; wait outside session lock |
| Live evidence | Live sessions inherited fake outage events and measurements | Unknown live service state and unassessed severity |
| Kubernetes | `all([])` marked pods without container statuses ready | Require running/non-deleting pods and real ready statuses |
| Docker logs | stderr disappeared whenever stdout contained data | Preserve both output streams |
| Command parsing | Scaling could extract an incident ID or drop a negative sign | Parse explicit signed replica counts and validate before staging |
| Async API | HTTP infrastructure checks could block the event loop | Offload blocking adapter/runbook work to threads |
| Recording | Marker IDs repeated after the history limit | Monotonic marker IDs |
| Deployment | Production image lacked Docker CLI; mode/token were not passed | CLI stage, environment forwarding, health checks |
| Network exposure | Sandbox Redis/Postgres/payment ports bound to all interfaces | Bind sandbox ports to localhost |
| Packaging/CI | Missing backend README/build package selection; CI referenced nonexistent Poetry workflow | Backend package metadata and direct dependency install; refreshed uv lock |
| Submission claims | Checklist asserted certification, old test counts, unverified public URLs, latency and prize split | Grounded checklist/architecture with explicit pending live checks |

## September 11 follow-up repairs

- Prevent a disconnected HTTP/WebSocket request from releasing its session lock before a blocking infrastructure operation has finished, including repeated cancellation.
- Read current playback state in the voice callback, preserving one WebSocket across playback and engine changes.
- Replace the retired LeMUR endpoint with AssemblyAI LLM Gateway. The local key denied Claude Sonnet access; `qwen3.5-4b-32k-fast` succeeded and is now the configurable default.
- Keep the command composer visible on a 1366×768 laptop; compact the welcome state and improve service label contrast.
- Revise stale pitch/video claims and export an eight-slide presentation PDF.
- Add regression coverage for cancellation, playback interruption, stale audio, MP3 decode failures, PCM format, and hook cleanup.

API references: [LLM Gateway request format](https://www.assemblyai.com/docs/llm-gateway/quickstart), [available models](https://www.assemblyai.com/docs/llm-gateway/available-models), and [LeMUR retirement notice](https://www.assemblyai.com/changelog?trk=public_post-text).

## Evidence-first investigation follow-up

- Capture an immutable incident baseline and numbered service-health/log observations; generate hypotheses through AssemblyAI LLM Gateway. Validate service IDs and cited references, deduplicate citations, and retain an explicit local fallback.
- Keep the overview grounded in captured facts; generated causal reasoning stays in unverified hypothesis cards. Diagnostic buttons inspect logs without executing generated commands.
- Mark stale briefs and verification results when observed service state changes. Export session-scoped evidence and recovery receipts through an authenticated handoff endpoint.
- Compare each action’s target before/after state and separately verify all configured services. Simulator actions now change only their approved target. Unknown live metrics remain unknown.
- Add a responsive Brief panel with evidence navigation, recovery comparisons, freshness notices, and handoff download.
- Strengthen managed tool selection and send compact investigation context for spoken replies while retaining full evidence in the UI. Typed requests are explicit in the provider’s documented reply instructions. The remediation tool description now states that it stages a request and requires a real tool result before announcing approval readiness.

## External validation

On September 11, actual AssemblyAI calls with the configured local key confirmed:

- Streaming v3 connected and transcribed generated speech as “Check Cluster Health.” This exercised real transcription with synthetic input, not the user's physical microphone.
- Managed Voice Agent API connected, called `get_cluster_health` with simulated incident data, and returned PCM audio.
- LLM Gateway generated reports with `source=assemblyai_llm_gateway` using `qwen3.5-4b-32k-fast`. Report failures remain explicitly labeled local fallbacks.
- A real-browser flow generated an AssemblyAI brief containing 17 observations and 3 hypotheses, focused a citation, approved a simulated restart, verified three remaining affected services, and exported the handoff without browser errors.
- A managed voice session invoked `investigate_incident`, returned a Gateway-generated brief, and produced a final spoken transcript with PCM audio. Longer replies exceeded earlier validation deadlines; compact voice tool results reduced the payload. Gateway errors remain visible local fallbacks. Repeated live checks also hit HTTP 429; the app now explains the provider rate limit while retaining all captured evidence. Avoid rapid repeated analysis during the demo.
- The real-backend smoke harness passed session setup, both voice handshakes, simulated approvals, runbooks, untrusted-origin rejection, duplicate-connection rejection, and input bounds.

Still unverified: the user's microphone/speaker quality and acoustic echo handling; an actual microphone-driven managed approval; a separately configured custom Gemini/OpenAI key; live Docker/Kubernetes actions; and the public HTTPS deployment.

## Remaining prototype limitations and competitive risks

- In-memory sessions, recordings, and audit records are lost on restart; multiple workers/replicas are unsupported. Sessions are capped at 100, and heavy simultaneous audio recording still needs memory/load testing on the target host.
- Custom-engine speech output is not captured in replay. Captured audio timestamps use server arrival times, so replay alignment is approximate under network jitter.
- Docker mode supports configured restarts; scaling, cache flush, DNS failover, and circuit breakers have no live Docker implementation. The sample payment service remains unhealthy after a plain restart.
- Built-in runbooks are most complete in simulation. Live application telemetry and unsupported mutations may stop their verification/action steps.
- The custom pipeline buffers full speech synthesis; low-latency claims require actual measurement. No project-specific WER benchmark has been measured.
- Authentication uses one shared operator token, not individual identities or hardware MFA. The audit chain is session-memory evidence, not compliance certification.
- Revised pitch/video materials require a final editorial review against the actual recorded demo. Use `SUBMISSION_CHECKLIST.md` for the remaining submission work.
- A complete live demo, an actual deployed URL, and final submitted media have not been verified by the offline checks.

## Reproduce checks

September 12 re-verification: **240 backend tests passed (1 opt-in live test skipped), 36 frontend tests passed** across 7 Vitest files, production frontend build passed, multi-phase paper-reviewed verification pass recorded (phases 1–12, see `RESEARCH_PHASES.md` and `COMPLETION_AUDIT.md`), and the 61-turn offline benchmark runs at 100%: 100% scenario pass and 100% safety adherence (mock LLM, provisioned operators; live pilot still pending). Real-backend Chrome smoke had previously passed at desktop, laptop, phone, landscape, and tablet sizes; the composer is explicitly checked inside the laptop viewport. Production Compose validation and the eight-page PDF export passed. Backend tests report two upstream TestClient deprecation warnings.

The earlier repair pass also recorded a Docker image build/smoke test, backend wheel build, `uv lock --check`, and zero known production npm dependency vulnerabilities. Those earlier results are not a fresh image build of the September 11 changes.

From `backend/`: `.venv/bin/pytest tests/ -q`.

From `frontend/`: `npm run build`, `npm test`, and `npm run test:browser` (requires local Chrome and the backend virtual environment).

From the repository root: `docker compose -f docker-compose.prod.yml config --quiet` and `git diff --check`.

The browser smoke test uses a real, isolated simulation backend and tests cited investigation briefs, evidence focus, handoff downloads, target recovery, remaining impact, commands, approvals, reports, settings, and layouts at desktop/phone/landscape/tablet sizes. Browser speech is stubbed; it is not a microphone-quality test.

Live provider checks: `backend/.venv/bin/python scripts/validate_providers.py`. Managed investigation/approval/recovery validation: `backend/.venv/bin/python scripts/validate_voice_investigation.py`. This uses provider quota and isolated simulated data; it never operates host infrastructure.

# Demo-readiness audit — September 10, 2026

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

## Blocking external validation

At audit time, local AssemblyAI, Gemini, and OpenAI values were placeholders. No real voice/LLM/report API request can be validated with them. Add actual keys locally or in hosting-provider secrets, then test:

1. Live microphone → final AssemblyAI transcript → audible reply.
2. Managed-engine tool call → operator approval → actual result, including barge-in.
3. Custom LLM function-call loop with the selected model.
4. LeMUR report with `source=assemblyai_lemur`, not a local fallback.
5. The deployed HTTPS URL in a clean browser session.

## Remaining prototype limitations and competitive risks

- In-memory sessions, recordings, and audit records are lost on restart; multiple workers/replicas are unsupported. Sessions are capped at 100, and heavy simultaneous audio recording still needs memory/load testing on the target host.
- Custom-engine speech output is not captured in replay. Captured audio timestamps use server arrival times, so replay alignment is approximate under network jitter.
- Docker mode supports configured restarts; scaling, cache flush, DNS failover, and circuit breakers have no live Docker implementation. The sample payment service remains unhealthy after a plain restart.
- Built-in runbooks are most complete in simulation. Live application telemetry and unsupported mutations may stop their verification/action steps.
- The custom pipeline buffers full speech synthesis; low-latency claims require actual measurement. No project-specific WER benchmark has been measured.
- Authentication uses one shared operator token, not individual identities or hardware MFA. The audit chain is session-memory evidence, not compliance certification.
- Older pitch/video files still need editorial review before publication. Use `SUBMISSION_CHECKLIST.md` for current supported claims.
- A complete live demo, an actual deployed URL, and final submitted media have not been verified by the offline checks.

## Reproduce checks

Latest verification in this pass: **82 backend tests passed**, **21 frontend tests passed**, production frontend build passed, real-backend Chrome smoke passed, both Compose configurations validated, `uv lock --check` passed, and the backend wheel built successfully. `npm audit --omit=dev` reported zero known production dependency vulnerabilities. The backend test run also reports two upstream TestClient deprecation warnings.

From `backend/`: `.venv/bin/pytest tests/ -q`.

From `frontend/`: `npm run build`, `npm test`, and `npm run test:browser` (requires local Chrome and the backend virtual environment).

From the repository root: `docker compose -f docker-compose.prod.yml config --quiet` and `git diff --check`.

The browser smoke test uses a real, isolated simulation backend and tests commands, approvals, reports, settings, and layouts at desktop/phone/landscape/tablet sizes. Browser speech is stubbed; it is not a microphone-quality test.

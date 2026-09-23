# IncidentVoice

**A restart is not a recovery.** IncidentVoice is a voice incident copilot built during the September 2026 [AssemblyAI Voice Agent Hackathon](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) for on-call engineers investigating service outages.

During an incident, an engineer can ask IncidentVoice to investigate, inspect the observations behind its hypotheses, request a remediation, and check whether the service actually recovered. A requested infrastructure change is staged for 30 seconds and requires operator confirmation. The demo labels simulated actions and never presents a successful command as proof that the whole incident is resolved.

## Try the core workflow

1. Start the app in simulation mode using the setup below. To use real voice, configure `ASSEMBLYAI_API_KEY` privately in `.env` and allow microphone access in the browser. Typed commands also exercise the workflow without a provider key.
2. Choose **Path 1: Voice Agent API**, start voice, and say “Investigate the incident.” Open a cited observation in the brief. The brief distinguishes captured evidence from unverified hypotheses. AssemblyAI LLM Gateway analysis may fall back to a clearly labeled local summary if unavailable.
3. Say “Restart payment-service.” Inspect the staged target and expiry. Cancel it, or request it again and approve it. No remediation is dispatched before confirmation.
4. Say “Verify recovery.” Compare the approved target's before/after measurements and check the remaining services. Export the evidence handoff or generate a draft incident review.

The simulation is designed to demonstrate control and verification safely. Docker mode supports restarts of configured sandbox containers; it does not implement every simulated mutation. See the [deployment guide](docs/DEPLOYMENT_GUIDE.md) for the exact live adapter scope.

## How AssemblyAI is used

| Path | AssemblyAI service | Role in IncidentVoice |
|---|---|---|
| Managed voice | [Voice Agent API](https://www.assemblyai.com/docs/voice-agents) | Spoken conversation, turn detection, audio replies, and tool calls routed through the same approval policy as typed commands. |
| Custom voice | [Streaming Speech-to-Text](https://www.assemblyai.com/docs/streaming) | Live transcription feeding the custom SRE orchestrator; speech output is handled separately. |
| Incident analysis | [LLM Gateway](https://www.assemblyai.com/docs/llm-gateway/quickstart) | Evidence-grounded hypotheses and incident review drafts when the provider is available. Provider failures are disclosed in the UI. |

The backend joins the voice paths to service telemetry, numbered observations, role checks, a staged-action guardrail, recovery receipts, and a session evidence handoff. Sessions and audit evidence use local transactional storage; deployment is limited to one app worker/replica. See [architecture](docs/ARCHITECTURE.md) for details.

## Run locally

Requirements: Python 3.11+, Node.js 20+, npm; Docker is optional.

```bash
cp .env.example .env
# Add ASSEMBLYAI_API_KEY to .env for a real voice demonstration.
./scripts/dev.sh
```

Open [http://localhost:5173](http://localhost:5173). The API runs at [http://localhost:8000](http://localhost:8000). Do not commit `.env` or operator tokens.

For the instrumented local payment, database, and Redis sandbox, follow the [Docker setup](docs/DEPLOYMENT_GUIDE.md#live-docker-sandbox). A remotely hosted microphone demo needs HTTPS. There is no verified public deployment URL in this repository yet.

Simulation starts with a demo operator only when no private operator directory or access token is configured. Set `OPERATOR_ACCESS_TOKEN` to require sign-in, or provision individual `SRE_COMMANDER`, `INCIDENT_RESPONDER`, and `READ_ONLY_OBSERVER` identities with `backend/.venv/bin/python -m app.core.operators_cli`. Credentials are stored as hashes in private local storage; no sample accounts are installed.

## Verification

The repository's automated checks cover the approval boundary, role enforcement, evidence capture, recovery reporting, and browser workflow. The 61-turn benchmark is an **offline, scripted simulation with a mock reasoning provider**; it is not a human pilot or a live speech accuracy/latency measurement.

```bash
cd frontend
npm ci
npm run build
npm test
npm run test:mobile
npm run test:browser

cd ../backend
.venv/bin/python -m pytest tests/ -q
BENCHMARK_OUTPUT_PATH=/tmp/incident-voice-benchmark.json .venv/bin/python ../scripts/benchmark_eval.py
```

Browser checks need local Chrome and an isolated backend. The [pilot protocol](docs/PILOT_EVALUATION_PROTOCOL.md) describes further human evaluation; it has not been completed. Real microphone quality, provider quota behavior, and any public deployment need separate validation before submission.

## Submission materials

- [Submission readiness and remaining gates](docs/SUBMISSION_CHECKLIST.md)
- [Submission form copy](docs/SUBMISSION_COPY.md)
- [Verified event rules and open questions](docs/HACKATHON_RULES_RESEARCH.md)
- [Three-minute demonstration script](docs/DEMO_SCRIPT.md)
- [Pitch deck PDF](docs/IncidentVoice-Presentation.pdf)
- [Deployment guide](docs/DEPLOYMENT_GUIDE.md)

The general lablab guidance asks for a reachable demo, public repository, short video, and PDF pitch deck. Confirm the exact event form and cutoff in the logged-in dashboard. Draft tickets and Slack briefings are artifacts for review; they are not sent to external systems by the demo.

## License

MIT; see [LICENSE](LICENSE).

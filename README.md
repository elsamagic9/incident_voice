# IncidentVoice

**A voice incident copilot that shows its work.**

Investigate a service outage by voice, inspect the evidence behind the agent's hypotheses, approve an exact action, and check whether recovery actually followed.

Built for the [AssemblyAI Voice Agent Hackathon](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon).

![IncidentVoice evidence workspace](docs/assets/incident-brief.png)

## The demo to try

1. Start voice. The default engine uses AssemblyAI's managed Voice Agent API.
2. Say **“Investigate the incident.”** The brief captures service health and logs and generates ranked hypotheses through AssemblyAI LLM Gateway.
3. Open an **E01-style evidence reference** to inspect the observation behind a hypothesis. These are hypotheses to verify, not asserted root causes.
4. Say **“Restart payment-service.”** Review the target and expiry. Say **“Do not confirm”** to cancel, or explicitly approve the matching action.
5. Review the **before/after recovery card**, then ask **“Verify recovery.”** A healthy target does not mean the entire incident is resolved.
6. Export the **incident handoff**, or generate a sourced incident review with draft follow-up work.

The default incident uses clearly labeled simulated infrastructure. Voice processing and AI analysis use real AssemblyAI services when configured. No cloud infrastructure is needed to reproduce the demonstration.

## What makes the workflow useful

- **An inspectable investigation:** Captured observations have source labels, timestamps, and IDs. Generated hypotheses must reference existing observations and configured services; invalid output falls back to local evidence.
- **Evidence freshness:** The original baseline remains intact. Changes to service state mark the brief and previous recovery checks as stale.
- **Approval before execution:** All mutations pass through a shared backend policy. Approvals bind an action ID and target, expire after 30 seconds, and cannot be replayed. Negative confirmation cancels.
- **Recovery checks:** Each executed action gets a before/after receipt. Cluster verification distinguishes healthy, degraded, failed, and unknown states without inventing unavailable metrics.
- **A usable handoff:** Download the incident, evidence, hypotheses, and recovery checks as JSON. Reports can include drafted follow-up work; nothing is sent to Slack, Jira, or PagerDuty automatically.

## AssemblyAI architecture

| Path | Pipeline |
|---|---|
| Managed voice — default | AssemblyAI Voice Agent API · 24 kHz PCM · shared incident tools and approvals |
| Custom voice | AssemblyAI Streaming v3 · 16 kHz PCM · configured Gemini/OpenAI reasoning or labeled scripted commands · Edge TTS/browser speech |
| Investigation and reports | AssemblyAI LLM Gateway · `qwen3.5-4b-32k-fast` by default · validated report structure and evidence references |

The managed path, incident briefs, and reports work with one AssemblyAI key. A separate Gemini/OpenAI key is optional for the custom path. Set `LLM_GATEWAY_MODEL` to another model your account can access.

## Run locally

Requires Python 3.11+, Node.js 20+, and npm. Docker is optional.

```bash
cp .env.example .env
# Set ASSEMBLYAI_API_KEY in .env; never commit it.
./scripts/dev.sh
```

Open [the dashboard](http://localhost:5173). For a single-server preview, run `npm run build` inside `frontend`, then start `uvicorn main:app` inside `backend`; the dashboard is served on port 8000.

Start with `INFRASTRUCTURE_MODE=simulation`. Without provider credentials, typed commands and evidence capture still work with clearly labeled local fallbacks. Microphone capture needs HTTPS or localhost and browser permission.

Use an operator token for an exposed demo. When `OPERATOR_ACCESS_TOKEN` is configured, enter it in the dashboard. Live modes require a token.

## Live infrastructure scope

Docker supports inspection and restarts of explicitly configured containers. Kubernetes supports configured pod inspection, rollout restarts, and node cordoning through the host's `kubectl` context. The image includes Docker CLI; Kubernetes requires an additional configured CLI and credentials. Unsupported live actions return failures instead of silently simulating success.

Recorded audio contains received microphone PCM and managed-agent PCM. Custom TTS and browser speech are not included in replay. Empty recordings remain unavailable.

## Verify

```bash
# backend/
.venv/bin/python -m pytest -q

# frontend/
npm run build
npm test
npm run test:browser

# repository root; uses provider quota, simulation only
backend/.venv/bin/python scripts/validate_providers.py
backend/.venv/bin/python scripts/validate_voice_investigation.py
```

The browser suite covers incident briefs, evidence navigation, handoff export, approvals, recovery checks, reports, and responsive layouts. Offline tests do not prove microphone quality or public deployment readiness. See the [validation record](docs/DEMO_READINESS_AUDIT.md) for observed results and limits.

## Submission materials

- [Short demonstration script](docs/DEMO_SCRIPT.md)
- [Presentation PDF](docs/IncidentVoice-Presentation.pdf), [source](docs/PITCH_DECK.md), and [slides](docs/pitch_deck.html)
- [Submission checklist](docs/SUBMISSION_CHECKLIST.md)
- [Architecture](docs/ARCHITECTURE.md) and [deployment guide](docs/DEPLOYMENT_GUIDE.md)

## Prototype boundaries

Sessions, recordings, and audit records live in one backend process and expire after eight hours or on restart. Use one worker/replica and export evidence to retain it. Authentication is a shared operator token; the audit chain is in-memory tamper evidence, not compliance certification. AI hypotheses can be wrong even when their references are valid. Live performance metrics require a telemetry integration.

[MIT license](LICENSE)

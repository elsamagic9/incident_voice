# IncidentVoice — lablab submission copy

Field limits used below: title ≤ 50 characters, summary ≤ 255 characters, long
description ≥ 100 words. Counts are verified, not estimated. Confirm the live
form's fields before pasting; general lablab guidance is not event-specific.

## Title — 44/50 characters

```
IncidentVoice: Voice SRE That Shows Its Work
```

## Short summary — 194/255 characters

```
An AssemblyAI voice copilot for outage triage. It cites the evidence behind every hypothesis, and a destructive change stays staged until a human speaks a one-time code the agent can never read.
```

## Long description — 212 words

On-call engineers lose the first minutes of an incident assembling context. IncidentVoice moves that work into one voice workspace built on AssemblyAI.

Ask it to investigate an outage and it captures service health and log observations, then presents possible causes linked to numbered evidence you can open. No hypothesis is stated without the observation behind it.

When the agent wants to change something, the backend stages the action with an exact target and a 30-second expiry, and nothing executes. Authorization requires the operator to speak a one-time code generated per action and displayed only on the approval card. The code is never returned to the model that requested the change, so the agent cannot satisfy its own confirmation. The operator can also veto with a single word. Afterward IncidentVoice compares the target's before-and-after health and checks the rest of the affected services, because a successful command is not a recovery.

AssemblyAI powers the managed Voice Agent API for conversation, Streaming Speech-to-Text for the alternate path, and the LLM Gateway for incident analysis. Provider failures and local fallbacks are labeled rather than hidden.

The public demo runs against a clearly marked simulation, with simulated and live results kept separate. A restart is not a recovery, and the interface is built to prove it.

## Technologies and category

- AssemblyAI Voice Agent API, Streaming Speech-to-Text, LLM Gateway
- Developer tools, SRE, incident response
- FastAPI, WebSocket, React, TypeScript, SQLite

## Links

- Public repository: https://github.com/elsamagic9/incident_voice
- Live demo: `PENDING_DEPLOY_URL`
- Demo video: `PENDING_VIDEO_URL`
- Pitch deck: `docs/IncidentVoice-Presentation.pdf`
- Deployment platform: Render (free plan, Docker)

## Claims the media must support

Every claim below is backed by code that is in the public repository. Do not
improvise past them during judging.

- "A restart is not a recovery" — the recovery check reports *partial recovery*
  while `order-db` is still critical (`test_investigation.py`).
- "The agent cannot authorize its own change" — the approval code is required
  and is stripped from the tool result sent back to the managed voice agent
  (`auth_rbac.py`, `assemblyai_voice_agent.py`, and
  `test_bare_affirmative_does_not_authorize`).
- "Simulation is labeled" — the approval card and brief both carry the
  simulated flag; `INFRASTRUCTURE_MODE=simulation` on the deployed service.
- "AssemblyAI is doing the work" — the investigation brief is generated through
  the LLM Gateway; the brief labels its `analysis_source`.

## Claims to avoid

Do not state sub-300 ms latency, a measured WER, a completed human pilot,
production certification, sent notifications, or external ticket creation. The
61-turn benchmark is an offline scripted simulation with a mock reasoning
provider, not a voice accuracy or latency measurement.

## Known limits of the hosted demo

- Render's free plan is 0.1 CPU / 512 MB and sleeps after 15 minutes without
  inbound traffic. The first click after a sleep waits about a minute while
  Render's loading page shows.
- The filesystem is ephemeral: the local SQLite session, WAL, and audit stores
  reset on every sleep and redeploy. Each visit therefore starts from a clean
  incident, which is intentional for a demo.
- The demo has no sign-in, so a judge can click straight in. That is safe only
  because every infrastructure effect is simulated.
- Do not demonstrate the web-news tool during judging. Render may suspend a
  free service that originates an unusually high volume of outbound traffic,
  and that feature scrapes a search engine.

# IncidentVoice architecture

## Request flow

```text
React 18 dashboard
  ├─ POST /api/session → HttpOnly operator-session cookie
  ├─ /ws/agent → session-bound controls, transcripts, tool results, audio
  └─ AudioWorklet → PCM16 mono audio (16 kHz custom / 24 kHz managed)
          │
FastAPI: origin checks + per-session lock + command queue
          ├─ Custom: AssemblyAI Streaming v3 → Gemini/OpenAI tools → Edge TTS/browser speech
          └─ Managed: AssemblyAI Voice Agent API → tool.call → shared SRE dispatcher
                                      │
                         Shared staged-approval boundary
                         ├─ Simulation: isolated service fixtures
                         ├─ Docker: configured container restarts
                         └─ Kubernetes: rollout restart / cordon
                                      │
                         Recorded timeline + session audit chain
                                      │
                         LeMUR report or labeled local summary
```

## Session and authorization model

`OperatorSessionMiddleware` binds HTTP and WebSocket requests to a browser-owned session using a cookie. Live infrastructure requires `OPERATOR_ACCESS_TOKEN`. Demo sessions are isolated but can be unauthenticated when no token is configured.

Session-local services resolve through a `ContextVar`; worker threads inherit that context through `asyncio.to_thread`. HTTP operations and queued WebSocket commands use a session lock. Only one WebSocket connection is allowed for each browser session.

Mutations are staged with a random action ID, challenge, and 30-second expiry. Verbal confirmation must match an explicitly accepted phrase; UI approval must match the current action ID. The grant is single-use and bound to action and target. Cancellation, expiry, and disconnect remove staged approval. Demo auto-approval applies only to simulation. This is not hardware MFA.

Sessions expire after eight hours or on server restart. They, recordings, and the audit chain are in memory. Run a single worker/replica until session state is moved to shared storage.

## Voice engines

### Custom

The worklet emits 64ms frames at 16kHz. The backend sends them to `wss://streaming.assemblyai.com/v3/ws`, receives turns, and deduplicates final transcripts by turn order. A bounded command queue serializes processing. The orchestrator uses Gemini/OpenAI if configured, otherwise explicit scripted commands. Edge TTS produces a complete MP3 response; it is not a chunk-by-chunk streaming TTS implementation. Browser speech is a labeled fallback.

### Managed

The backend connects to `wss://agents.assemblyai.com/v1/ws`, sends inline configuration, and waits for `session.ready` before accepting microphone frames. Audio is 24kHz PCM16. Function calls are collected until `reply.done` and dispatched through the same approval boundary. Interrupted replies discard queued calls and stale results. Application outcomes are sent using the documented `conversation.message` roles.

Protocol reference: [AssemblyAI events](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/events-reference).

## Infrastructure truthfulness

- Simulation has pre-seeded incident events and metrics, explicitly labeled as demo data.
- Live sessions begin with unknown service state and unassessed severity. They do not inherit sample PagerDuty/HPA events.
- Docker mode inspects configured containers and supports their restarts. Application latency/error-rate/CPU metrics remain unavailable without a metrics integration. A restart alone does not prove application recovery.
- Kubernetes readiness requires a running, non-deleting pod with actual ready container statuses. Failed connections remain unavailable, not simulated success.
- Dependency topology and fault injection are simulation features.
- Escalations, tickets, and briefings are drafts. No external delivery integrations are active.

## Runbooks and artifacts

The database, Redis, and ingress runbooks have read steps, approval-gated mutation steps, and verification gates. Failed gates keep the current step active. Completing a runbook is not a claim that all cluster services recovered.

LeMUR requests return structured summaries and draft follow-up items. Failures produce a `local_events` summary with a warning and no invented tickets. MTTD stays unknown; MTTR is derived only from a recorded resolution timestamp.

The blackbox records received microphone PCM and managed-engine output. It does not capture custom-engine TTS/browser speech. Text-only sessions export no audio. Recording is bounded to ten minutes and replay mixes the captured tracks into a 24kHz mono WAV.

The SHA-256 chain detects changes to its current in-memory contents. It is not immutable external storage, a Merkle tree, or SOC-2/ISO certification.

## Verification boundaries

Automated checks cover contracts, fallback behavior, role/approval boundaries, browser interactions, and isolated infrastructure adapters. Live provider connectivity, microphone acoustics, latency, cloud deployment, and real recovery require separate rehearsal with valid credentials and infrastructure.

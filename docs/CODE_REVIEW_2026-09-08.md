# IncidentVoice code review — 8 September 2026

The frontend compiles, but the project has reproducible authorization and session bugs, incompatible managed-voice API handling, and deployment gaps. Treat it as a prototype until these are addressed.

Application source was not changed during this review. Infrastructure mutations were mocked. No successful live microphone-to-AssemblyAI-to-speaker session or cloud deployment was verified.

## Validation

- `cd frontend && npm run build`: passed TypeScript and Vite production build.
- Existing backend suite with AI credentials disabled, TTS mocked, and live Docker/Kubernetes disabled: **45 passed, 4 failed**, in 6.25 seconds.
- One failure requires `docker_active is True`, despite Docker being optional. Three failures concern authorization/cancellation WebSocket tests. Their helper stops at an `awaiting_confirmation` message, while TTS can enqueue another such message, so the next command can consume the previous command's state. These are timing-sensitive tests; this result does not prove that all three underlying actions fail.
- Separate isolated reproductions verified negative-utterance execution, expired UI authorization, changed-target execution after a second tool call, dropped documented API events, the reset exception, cross-client authorization, false success after infrastructure failure, and a frontend reconnect after cleanup.
- Temporary Python reproduction harness: `/tmp/incident_voice_bug_repros.py`. Offline suite runner: `/tmp/incident_voice_review_checks.py`. These disable external AI credentials and mock infrastructure access.

## Findings, prioritized

### 1. High — Managed Voice Agent API events and audio format are incompatible

Locations: `backend/app/services/assemblyai_voice_agent.py:126`, `:167`, `:209`, `:397`, `:468`; `frontend/src/hooks/useAudioPlayer.ts:99`; `frontend/public/audio-processor.js:10`.

The handler recognizes `output.audio` and several aliases, but does not recognize the documented `reply.audio` event. Feeding it a valid `reply.audio` payload produced **zero audio callbacks**. `session.error` was also silently ignored. Reply lifecycle and interruption events are not mapped into UI state.

The session requests `audio/pcm16` at 16 kHz, and the microphone and player use 16 kHz for both engines. The current managed API documents `audio/pcm` at 24 kHz. Text commands use `user.transcript` rather than the documented `conversation.message` followed by `reply.create`. Shutdown sends `session.terminate` rather than `session.end`. Tool results are sent immediately inside `tool.call`; the current reference specifies draining results on `reply.done`.

Impact: managed-engine silence, invalid session configuration or incorrectly timed audio, ignored typed commands, and incorrect tool/session lifecycle. An open WebSocket is marked connected before `session.ready`, which can conceal initialization failure.

Fix: implement the documented protocol exactly, use engine-specific capture/playback formats, wait for readiness, and surface errors. Validate against actual provider events rather than accepting several guessed aliases.

Sources: [AssemblyAI event reference](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/events-reference), [audio formats](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/audio-format), [session configuration](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/session-configuration).

### 2. High — Default Gemini model has been shut down

Location: `backend/app/services/orchestrator.py:586`; fallback at `:277`.

The default provider calls `gemini-2.0-flash`. Google states that it was shut down on June 1, 2026. Errors are caught and routed into the deterministic keyword engine, which can make the UI appear functional while model-driven reasoning is unavailable.

Fix: make the model configurable, choose a currently supported model, verify its tool-calling contract, and display the actual active reasoning provider/fallback state.

Source: [Google Gemini 2.0 Flash documentation](https://ai.google.dev/gemini-api/docs/models/gemini-2.0-flash).

### 3. High — Negative speech authorizes destructive actions

Locations: `backend/app/services/orchestrator.py:223`; `backend/app/core/auth_rbac.py:122`.

Confirmation uses substring matching and checks affirmative words before cancellation. With an action staged, each of **“don't confirm”**, **“do not execute”**, and **“not approved”** invoked the mutation once in isolated reproductions.

Fix: process explicit negation/cancellation first; accept narrowly defined affirmative responses or the complete challenge; leave ambiguous statements pending. Add tests using negative sentences, not just a bare “cancel”.

### 4. High — A second managed-engine tool call bypasses confirmation

Location: `backend/app/services/assemblyai_voice_agent.py:316`.

When `awaiting_confirmation` is already true, another destructive tool call is treated as proof of user confirmation. No authorization evidence or target match is checked. Reproduction: stage a restart of `payment-service`, then send a tool call to restart `order-db`; the second target executes without any intervening user response.

Fix: only an explicit, validated authorization transition may execute the stored action. Subsequent model tool requests must not satisfy that transition or change the authorized target.

### 5. High — Public endpoints have no authenticated operator identity; hardware MFA is cosmetic

Locations: `backend/app/api/websocket.py:22`, `:369`; `backend/app/api/routes.py:65`; `backend/app/core/auth_rbac.py:66`; `frontend/src/App.tsx:184`; `frontend/src/hooks/useVoiceStream.ts:403`.

The WebSocket accepts a connection without authentication or an Origin check. Operators default to `SRE_COMMANDER`; there is no login-backed role binding. REST runbook endpoints also accept commands without authentication. The “Touch Security Key” button sends only `{"type":"authorize_remediation"}`. There is no WebAuthn credential challenge/assertion or server verification.

Impact: if exposed as documented, anyone who reaches the backend can issue commands as the default commander. Claiming FIDO2 authorization is unsupported by the implementation.

Fix: authenticate connections, bind permissions to a verified identity, enforce authorization at the mutation boundary, and either implement WebAuthn or remove the hardware-verification claim. Runbook and direct Kubernetes tool dispatch must use the same enforcement; currently they can call mutations without the staging gate.

### 6. High — Clients share pending authorization and operational state

Locations: `backend/app/services/orchestrator.py:782`; `backend/app/core/auth_rbac.py:133`; `backend/app/api/websocket.py:392`.

The custom orchestrator, history, pending action, role/challenge, runbook, and incident state are process-global. Reproduction: client A stages a restart and disconnects; a fresh client B sends `authorize_remediation` and executes A's action.

Fix: associate conversations, challenges, and pending actions with authenticated sessions. If incident state is intentionally shared, use explicit incident membership and coordinated updates rather than sharing authorization state.

### 7. High — UI authorization ignores expiration and permission changes

Location: `backend/app/services/orchestrator.py:48`.

The custom engine's UI confirmation function does not check the staged timestamp, verify an active challenge, or recheck permissions. Reproduction: age an action by 120 seconds, change the role to `READ_ONLY_OBSERVER`, and call the UI confirmation path; it still executes. The 30-second check in the voice-turn path does not protect this path.

Fix: centralize expiry, session ownership, role, and one-time authorization checks immediately before execution, for every input path.

### 8. High — Failed infrastructure operations become successful, healthy services

Locations: `backend/app/tools/sre_tools.py:146`, `:174`; `backend/app/core/state.py:139`.

After attempting Docker and Kubernetes operations, the function applies simulated recovery regardless of failure. Reproduction: make both adapters return `success: false`; `execute_remediation` returns `success: true` and sets the service to `healthy`. The Kubernetes adapter can also fall back from a failed live rollout to a simulated successful rollout (`k8s_adapter.py:167`).

Fix: preserve live failures and report them. Use an explicit simulation mode, and only claim recovery after observing readiness/health from the chosen live provider.

### 9. High — Reset crashes the WebSocket handler

Location: `backend/app/api/websocket.py:455`.

The reset branch calls `blackbox_service.reset()`, but that name is never imported in this module. Reproduction returned **`NameError: name 'blackbox_service' is not defined`**. Some global state is reset before the exception; normal synchronization is never sent and the connection handler exits.

Fix: import the service and verify reset through the WebSocket control message, including state synchronization and continued commands afterward.

### 10. Medium — Frontend cleanup creates another WebSocket

Locations: `frontend/src/hooks/useVoiceStream.ts:96`, `:244`, `:390`.

Effect cleanup closes the socket, whose asynchronous `onclose` handler schedules reconnection after cleanup has already cleared timers. An isolated execution of the actual transpiled hook showed one socket before cleanup and a new open socket afterward. Engine switching also both sends `select_engine` and changes the effect dependency, causing competing session replacement paths. Development StrictMode makes the cleanup problem easier to encounter.

Fix: mark the effect disposed, disable handlers before intentional close, and use one engine-switch lifecycle. Clean up microphone capture on unmount as well.

### 11. Medium — MP3 decoding failures are played as raw PCM

Locations: `frontend/src/hooks/useAudioPlayer.ts:94`; `backend/app/services/tts_service.py:28`.

The backend streams chunks of compressed MP3, and the frontend tries to decode each independently. If decoding fails, it interprets compressed bytes as signed PCM samples. This can produce noise or broken speech rather than a meaningful fallback. Header sniffing also cannot reliably identify every fragment of a compressed stream.

Fix: send explicit encoding/sample-rate metadata and use an actual streaming decoder or buffer a complete MP3 before decoding. Never reinterpret failed compressed audio as PCM. Acoustic behavior was not verified on a live microphone/speaker session in this review.

Source: [MDN decodeAudioData documentation](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData), which specifies complete file data rather than fragments.

### 12. Medium — Production image cannot run the Docker bridge

Locations: `Dockerfile:19`; `backend/app/tools/infrastructure_bridge.py:18`; `docker-compose.prod.yml:20`.

The bridge shells out to the `docker` executable, but the production image installs only `curl` and `procps` as system additions. Mounting the Docker socket does not install that client. `is_docker_available()` catches the missing-executable error and returns false, hiding the missing integration behind simulation.

Fix: provide the required Docker client or use a supported client library, and make live/simulated infrastructure status explicit. Verify the packaged image, not only execution on a developer host with Docker installed.

### 13. Medium — Provider outages are not visible to the user

Locations: `frontend/src/hooks/useVoiceStream.ts:89`, `:232`; `backend/app/services/tts_service.py:32`.

“Connected” reflects the browser-to-backend socket, while backend provider status is logged to the console. There is no `error` event case in the frontend switch. TTS errors emit a synthetic frame and return normally; configured `tts_provider` values are never consulted. Selecting browser, Cartesia, or ElevenLabs still goes through Edge-TTS, and selecting Claude never reaches an implemented Claude reasoning path.

Fix: expose separate backend/provider readiness and failure states; implement advertised provider choices or reject unsupported configuration values. Do not report working speech after synthesis failure.

### 14. Medium — Autopilot toggle does not control the managed engine

Location: `backend/app/api/websocket.py:511`.

The toggle changes only `agent_orchestrator.autopilot_mode`. Managed sessions maintain a separate `voice_agent_session.autopilot_mode`, which is never changed by this control. The UI can therefore indicate autopilot while that engine still stages actions. Also, the implemented custom-engine mode bypasses confirmation for requested actions; it has no background detection/remediation loop supporting the README's autonomous monitoring claim.

Fix: synchronize the selected engine's mode and scope the description to the behavior actually implemented, or add and validate a separate monitoring loop.

### 15. Submission risk — Several evidence and readiness claims exceed implementation

Locations: `README.md`; `docs/SUBMISSION_CHECKLIST.md`; `backend/app/services/blackbox_service.py:205`; `backend/app/api/websocket.py:99`, `:289`; `backend/app/services/lemur_service.py:147`.

- “Black box” playback synthesizes tones and voice-like waveforms; it does not replay captured user/agent speech. The README describes actual dual-track recording.
- STT latency is hard-coded to 120 ms, tool time is estimated as 45 ms per tool, and initial UI latency is fabricated. These cannot substantiate the advertised end-to-end performance.
- Offline postmortems contain fixed root causes, actions, and recovery times. They are still announced as AssemblyAI LeMUR output, even when no provider request succeeds.
- Slack/PagerDuty integrations are explicit local simulations. Generated Jira-shaped tickets are not evidence that actual external tickets were created.
- The README calls the frontend React 19; the installed project declares React 18.3.1.
- The submission checklist claims a public repository is ready, but `git remote` returns no remotes in this checkout and repository/video URLs still contain placeholders. Banner files and deck sources exist. No final video or PDF/PPTX was found among tracked/unignored project files. External or untracked deliverables may exist elsewhere and were not verified.
- The local “49/49 passing” claim was not reproduced under the isolated test configuration above.

Fix: clearly label simulations, report measured values and actual artifact provenance, update documentation to match behavior, and replace placeholders with verified deliverables.

## Hackathon fit

The [event page](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) offers **either** the managed Voice Agent API **or** a custom pipeline built on AssemblyAI Realtime STT. Both engines are not required. Its judging dimensions are application of technology, presentation, business value, and originality. Listed deliverables include a cover image, video, slide presentation, public GitHub repository, and application URL.

A sensible repair order is to make one genuine AssemblyAI voice path reliable, fix the authorization/session bugs before exposing infrastructure controls, verify reset and packaged deployment, then record a reproducible demo and correct the submission claims. The observed event page does not substantiate the local checklist's claimed requirement to start a demo before 1:30.

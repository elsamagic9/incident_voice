# Completion audit — September 12, 2026

This audit supersedes earlier blanket “completed” labels in the research ledger. The full checklist and all twelve phase plans remain in scope. The current baseline passes 168 backend tests; this does not establish the external or end-to-end gates below.

| Requirement / phase | Evidence gap or defect under repair |
|---|---|
| R1 / 1 | Tool regression coverage exists; preserve and rerun the actual provider approval sequence after integration. |
| R2, R6 / 2 | Physical microphone/speaker rehearsal and reviewed recording are still missing. Verify both recording paths and timed interruption evidence. |
| R3 / 3 | Global WAL replay cannot restore isolated browser sessions at startup. Require a real process-restart test with two sessions, evidence and recordings. |
| R4 / 4 | Built-in published commander credentials, stale token mappings and nonpersistent revocation invalidate the existing completion claim. |
| R5 / 5 | Unit tests are not evidence of working live target remediation. Verify configured infrastructure and outcome receipts. |
| R7 / 6 | The plan requires at least 50 turns; the recorded harness has 46. Inspect state-based assertions and run the pilot protocol; a protocol is not a completed pilot. |
| R8, R9 / 7 | A Dockerfile is not a verified image or HTTPS deployment. Final demo video, current presentation review and actual submission links remain required. |
| R10 / 8 | Recheck web/document/media integration and source attribution beyond mocked unit tests. |
| R11 / 9 | Verify that reflection and memory remain evidence-grounded and cannot bypass approval. |
| R12 / 10 | Catalog MTTR and success rates are hardcoded examples, not measured incident history. Verify paper citations and label/rework historical matching. |
| R13 / 11 | Static predicted gains are not a validated world model. Verify candidate actions, simulated transitions and safety constraints. |
| R14 / 12 | No paper-review section was recorded before this plan. Verify the source, authorization, freshness and asynchronous behavior; the <2 ms claim lacks measurements. |

## Authorization repair: papers reviewed before the revised plan

- [Saltzer and Schroeder (1975), §I.A.3](https://web.mit.edu/Saltzer/www/publications/protection/Basic.html), read directly on the authors’ MIT site: default permission must be explicit, and cached authority must change when permission changes. Application: remove public credentials and recheck current credential state at session lookup and tool dispatch, including existing sockets.
- [Sandhu et al. (1996), printed p. 41, base model and sessions](https://www.profsandhu.com/cs5323_s18/RBAC96-1996.pdf), read from the author-hosted scanned page: users, roles, permissions and sessions are distinct; a session belongs to one user. Application: persist explicit operator assignments and preserve the same browser session on authenticated refresh, while switching identities creates a separate session. This is a limited application of the model, not a security certification.

### Revised implementation plan

1. Start with an empty operator directory. Persist operator token hashes and revocations in a transactional local SQLite store; provide a local provisioning command without public default tokens.
2. Rotate credentials atomically, reject duplicate/revoked tokens and invalidate older sessions. Recheck current identity, token and role on protected requests and tool execution.
3. Preserve incident state when an authenticated browser refreshes. Require explicit identity authentication in live mode and when the directory has configured operators.
4. Add regressions for published defaults, rotation, restart revocation, session refresh, role changes, unknown identities and existing connections. Rerun the backend suite and browser flow.

Status: implementation in progress. Deployment, microphone, pilot and final-media gates are still pending; no external result is inferred from local tests.

Authorization validation: 46 focused backend cases passed, including rotation, persistent revocation, role changes, authenticated refresh and a live WebSocket closing after revocation. The production frontend build, 37 frontend tests and real-backend Chrome workflow passed on desktop and mobile. Full-suite validation follows integration.

## Recovery repair: papers reviewed before the revised plan

- [Mohan et al., ARIES (1992), §3 and §13](https://www.cs.cmu.edu/~15849g/readings/mohan92.pdf), original paper read through the CMU-hosted copy. ARIES uses per-page state, redo and compensation records for interrupted transactions. An append-only event list that skips corrupt records does not implement those guarantees. Application: use database transactions for committed session snapshots, retain durable mutation intent, and never replay external infrastructure operations on restart. This application will not claim ARIES compliance.
- [Gao et al., ALCE (EMNLP 2023), §3.3](https://aclanthology.org/2023.emnlp-main.398.pdf), reviewed earlier in this work. Citation attribution depends on preserved supporting material. Application: restore the exact captured observations and receipt data with the incident, not a newly generated evidence baseline. Reference existence alone does not prove a hypothesis.
- Implementation reference: [SQLite WAL documentation, §2–3](https://sqlite.org/wal.html). Use local storage and FULL synchronous commits; let SQLite handle its transaction recovery. Keep the deployment to one application worker because active session services and locks remain in memory.

### Revised implementation plan

1. Persist browser session identity and an explicit, versioned snapshot of incident/service state, evidence, receipts, audit blocks, transcript, runbook progress and blackbox metadata. Store PCM chunks as separate blobs with offsets and source tracks.
2. Restore lazily by the existing session cookie, revalidate current operator credentials and enforce the eight-hour retention window. Never combine records from separate sessions. Expire pending approvals and report interrupted live mutations as uncertain.
3. Commit state at HTTP and WebSocket outcome boundaries; record mutation intent before infrastructure execution and outcome before returning a receipt. Fail visibly on storage errors instead of silently claiming durability.
4. Keep per-session event logs separate and reject a corrupted sequence; remove global startup replay. Verify two browser sessions, exact evidence/audio retention, expired approval, logout and interrupted-write behavior across process restarts.

Status: implementation in progress.

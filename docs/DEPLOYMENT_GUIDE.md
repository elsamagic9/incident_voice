# IncidentVoice deployment

The Docker image serves the React dashboard and FastAPI/WebSocket backend together on port **8000**. Deploy a single worker/replica because operator sessions are held in process memory. Use HTTPS for a remotely accessible microphone demo.

## Cloud demo (Render or Fly)

1. Build from the root `Dockerfile`, using `render.yaml` or `fly.toml` as appropriate.
2. Set `INFRASTRUCTURE_MODE=simulation`.
3. Set `ASSEMBLYAI_API_KEY` through the hosting provider's secret/environment UI.
4. For custom reasoning, configure `LLM_PROVIDER=gemini` and `GEMINI_API_KEY`, or `LLM_PROVIDER=openai` and `OPENAI_API_KEY`.
5. Set `OPERATOR_ACCESS_TOKEN` to restrict access and enter it in the dashboard's login form. Provide judges a way to obtain it separately from the public repository.
6. Verify `/api/health`, open the dashboard, sign in, and test a live microphone turn. A healthy HTTP server alone does not prove that the voice provider connected.

Do not configure Docker mode on a cloud host without an accessible Docker daemon. Kubernetes mode needs a configured `kubectl` installation and credentials; the included image does not bundle them.

## Local unified image

From the repository root, after creating `.env` from `.env.example`:

```bash
docker build -t incident-voice .
docker run --rm -p 8000:8000 --env-file .env incident-voice
```

Open http://localhost:8000. Build context exclusions keep `.env`, local virtual environments, and `node_modules` out of the image.

## Live Docker sandbox

The Compose stack launches the app and three sandbox containers. To use real container operations, set these values in `.env`:

```dotenv
INFRASTRUCTURE_MODE=docker
OPERATOR_ACCESS_TOKEN=<choose-a-private-operator-token>
```

Then run:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Compose passes the mode and token to the app and mounts `/var/run/docker.sock`. The image includes the Docker CLI used by the infrastructure bridge. On hosts with a different daemon socket, adjust the mount. A read-only socket mount does not make Docker API operations read-only; the application still authorizes each mutation.

Supported Docker mutations are **restarts of configured targets only**:

| Service | Container |
|---|---|
| payment-service | incident-payment |
| redis-cache | incident-redis |
| order-db | incident-order-db |

Container health checks distinguish a successful restart from verified application recovery. The sample payment service intentionally starts unhealthy, and a restart does not fix its application failure. Its `/recover` endpoint can restore the sandbox manually; the agent accurately reports unverified/unhealthy recovery rather than pretending a restart fixed it.

Application CPU/latency/error-rate metrics are unavailable in Docker mode unless a telemetry integration supplies them. The health matrix shows **—** for unavailable metrics. Dependency topology and fault injection are simulation features.

## Submission rehearsal

- Run the backend tests, frontend build, and frontend tests described in the README.
- Sign in through the actual public URL and grant microphone access.
- Confirm voice status reaches **ready** with AssemblyAI, then perform a real spoken turn.
- Stage and approve one action; verify the result matches the selected infrastructure mode.
- Generate a report and check its source. A local fallback is labeled and has no invented tickets.
- Replay captured audio only when the recording exists; text-only sessions have none.
- Export artifacts before restarting the server, which clears in-memory sessions.

Check the hackathon's current submission form for required links and media rather than relying on older pitch/checklist files in this repository.

## Individual operators and credential rotation

The operator directory starts empty. There are no built-in logins. An unconfigured simulation permits a demo session; live mode and a configured directory require authentication. `OPERATOR_ACCESS_TOKEN` remains available for a single configured commander.

For individual identities, run this from the backend environment, using the same `WAL_STORAGE_DIR` volume as the server:

```bash
.venv/bin/python -m app.core.operators_cli register --id oncall-alice --name "Alice" --role SRE_COMMANDER
.venv/bin/python -m app.core.operators_cli list
.venv/bin/python -m app.core.operators_cli revoke --id oncall-alice
```

Registration prompts privately for a randomly generated token of at least 32 characters. Supported roles are `SRE_COMMANDER`, `INCIDENT_RESPONDER`, and `READ_ONLY_OBSERVER`. Re-registering the same ID with a new token rotates it. Old tokens and sessions stop working; revoked tokens cannot be reused. Role changes require signing in again. The browser retains its incident on an authenticated refresh.

The private `operators.sqlite3` stores token hashes and revocations, never raw tokens. Mount its data directory persistently; do not include the database in the image or public repository. Revocation is rechecked on requests and tool dispatch; existing sockets close within the one-second session check interval. This does not undo an infrastructure operation that had already started.

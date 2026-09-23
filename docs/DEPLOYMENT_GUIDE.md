# IncidentVoice deployment

The Docker image serves the React dashboard and FastAPI/WebSocket backend together on port **8000**. Deploy one worker/replica: active voice sessions and locks are process-local, even though incident checkpoints can be restored from disk. Use HTTPS for a remotely accessible microphone demo.

## Public demo on Render

The checked-in `render.yaml` builds the root `Dockerfile` as one web service, checks `/api/health`, enables secure session cookies, and uses AssemblyAI for both the managed voice path and custom-path reasoning. It selects Render's **standard** plan; review the charge shown in your Render account before creating the service. No hosted service or public URL is created by this file alone.

1. Push the reviewed commit to your public GitHub repository, then in Render create a Blueprint from that repository using `render.yaml`. Render prompts for `ASSEMBLYAI_API_KEY` and `OPERATOR_ACCESS_TOKEN` because both are marked `sync: false`. Enter real values in Render's secret UI, never in Git or the video. The optional Gemini/OpenAI keys can remain blank.
2. Wait for the deploy and HTTP health check to pass. Open the assigned `https://…onrender.com` URL and sign in with the private operator token. Supply judges a way to obtain that token in the submission or direct instructions; an inaccessible demo weakens the entry.
3. In a clean Chrome/Edge profile, grant microphone access, select **Path 1: Voice Agent API**, and confirm a real spoken command appears in the transcript and receives audible speech. Run the staged approval and recovery flow from the [demo script](DEMO_SCRIPT.md). Check that the provider source is shown correctly and that a failed/rate-limited provider is visible rather than presented as a successful AI result.
4. Reload the app, repeat one voice turn, and test the same URL from a different device/network. Record the final video against this deployed build. Confirm the deployment URL, GitHub URL, video link, and PDF deck in the submission form before the event cutoff.

Render supplies an HTTPS `onrender.com` domain for web services. Its filesystem is ephemeral unless a paid persistent disk is attached; checkpoints in `/app/backend/data` will be lost on a restart or redeploy without one. For persistence, attach a disk at `/app/backend/data` in Render and keep one instance. Do not claim durable hosted recovery until a restart test on that service passes. A healthy HTTP server alone does not prove that AssemblyAI connected.

Fly is an alternative using `fly.toml`; configure the same private key, token, HTTPS, single instance, and persistent storage there, then perform the same rehearsal.

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
- Export artifacts before a hosted restart unless a persistent disk is configured and recovery has been tested there.

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

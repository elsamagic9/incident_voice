# IncidentVoice — Engineering Runbook for Agents & Developers

> This repo is built under explicit constraints: it targets the
> [AssemblyAI Voice Agent Hackathon](https://lablab.ai/ai-hackaths/assemblyai-voice-agent-hackathon),
> runs on CPU-only (GPU training/inference is forbidden locally), and keeps all
> secrets out of source. Treat every command below as authoritative.

## 1. Repository map

```
incident-voice/
├── backend/            FastAPI WebSocket hub + SRE orchestration
│   └── app/            services/, tools/, core (RBAC/WAL/audit), models
├── frontend/           React 18 + Vite + shadcn/ui Mission Control HUD
├── scripts/            benchmark_eval.py, stress_test_500.py, dev/run helpers
├── docs/               Research phases, pilot protocol, submission checklist
└── .github/workflows/  CI Suite (test.yml)
```

## 2. One-line setup

```bash
./scripts/dev.sh          # Backend (uvicorn) + Vite dev server
open http://localhost:5173   # Mission Control HUD
open http://localhost:8000   # Backend API docs
```

For a full sandbox cluster with an instrumented payment/order-db/redis stack:

```bash
docker compose -f docker-compose.prod.yml up --build
```

## 3. Standard toolchain commands

### Backend
All commands run from `backend/` (a `.venv/` is expected with `requirements.txt` installed).

```bash
.venv/bin/python -m pytest tests/ -q
.venv/bin/python -m pytest tests/ -k <substring>        # filter by test name
.venv/bin/python -m pytest tests/test_voice_agent_path1.py -xvs    # verbose debug
.venv/bin/python3 ../scripts/benchmark_eval.py            # 61-turn eval harness
.venv/bin/python -m app.core.operators_cli list          # inspect operator registry
```

Type info: this codebase uses **type hints** but has **no static type checker** pinned
beyond `pydantic` runtime validation. Run `pydantic` models through tests rather than
`mypy` (they aren't configured here).

The benchmark isolates its operator store and disables provider calls. Set
`BENCHMARK_OUTPUT_PATH` to keep its generated JSON outside the tracked
`backend/data/benchmark_results.json` file.

### Frontend
All commands run from `frontend/`.

```bash
npm ci                                 # install deps (do not use npm install)
npm run dev                            # Vite dev server, HMR
npm run build                          # tsc -b && vite build  (production)
npm test                               # vitest run — 36 regression tests
npm run test:browser                   # Playwright smoke (needs chrome + dev server)
npm run test:mobile                    # Playwright 320px overflow isolation
npm run lint                           # == tsc -b (full type-check)
```

Type safety: **TypeScript is the lint gate.** Vite's build is non-negotiable and runs
`tsc -b` first — a single type error fails the build. Treat every `tsc` error as a block.

## 4. Commit message convention

```
<type>[scope]: <sentence, ≤60 chars>

<body, wrap 72 cols>

Refs: #<issue>  (optional, GitHub only)
```

`<type>`: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`.
`<scope>`: `ui`, `voice`, `backend`, `wal`, `rbac`, `tools`, `benchmark`, `ci`, `deps`.

Examples from this repo's history are the style authority.

## 5. The verification loop (must pass before marking a task done)

1. `npm run build` (frontend type+build)
2. `npm test` (36 vitest, 7 suites)
3. `npm run test:mobile` (no horizontal overflow ≤ 321px)
4. `npm run test:browser` (desktop smoke: buttons present, no page errors)
5. `.venv/bin/python -m pytest tests/ -q` (245 backend tests; 1 opt-in live skip)
6. `.venv/bin/python ../scripts/benchmark_eval.py` (full 61-turn offline eval)

**CI mirrors steps 1–5** (`.github/workflows/test.yml`).
Browser tests (steps 3–4) require Chrome and are NOT in CI — run them locally before
handing off a UI change.

## 6. Non-negotiables

- **Never introduce a local-LLM inference suggestion** (CPU-only box).
- **Never print or log API keys, tokens, or `operators.sqlite3` contents.**
- **Never claim an action executed if it did not** (grounded evidence via OBS- IDs).
- **Two-phase safety guardrails must not be bypassed** — `staged` remediations
  require a 30s TTL + confirmation before dispatch.
- `.gitignore` covers `*.tsbuildinfo`, `node_modules/`, `*.sqlite3`, `.env`, `dist/`.
  If `git status` shows any of these tracked, **untrack them immediately**:
  `git rm --cached <path>`.

## 7. When a command fails

| Symptom | Triage |
|---|---|
| Backend import error `app.core.config` | `cp .env.example .env`; at minimum `ASSEMBLYAI_API_KEY` or `LLM_PROVIDER=mock`. The repo defaults to simulation mode — tests set env inline, so missing `.env` breaks prod runs not test. |
| `test:mobile` returns scrollWidth > 321 | Root cause is almost always an unbound `fit-content` flex child in a `items-start` container without an explicit `w-full`. Check the two-panel body (`App.tsx`) or the live-transcript HUD sizing. |
| `npm run build` fails on `max-h`/`clamp` CSS | Tailwind `clamp()` works in arbitrary values; prefer the existing `h-[clamp(...)]` pattern. |
| CI backend job times out on `pip install` | Pin major versions in `requirements.txt`; do not `pip install --upgrade` in CI. |

## 8. Ownership & escalation

| Area | Owner signal |
|---|---|
| Voice fidelity / STT/VAD | `backend/app/services/assemblyai_voice_agent.py` |
| LLM gateway / rate limits | `backend/app/services/llm_gateway.py` |
| WAL / audit / RBAC | `backend/app/core/wal_service.py`, `auth_rbac.py` |
| Four Golden Signals telemetry | `backend/app/tools/telemetry_tools.py` |
| Mission Control HUD | `frontend/src/App.tsx` + `components/` |
| Benchmark / eval harness | `scripts/benchmark_eval.py` + `docs/PILOT_EVALUATION_PROTOCOL.md` |

This file is the source of truth for how IncidentVoice is built and verified.
Update it as the repo's real conventions evolve — do not let docs drift.

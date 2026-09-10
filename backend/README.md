# IncidentVoice backend

Python 3.11+ FastAPI service. See the repository [README](../README.md) for configuration and supported capabilities.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
.venv/bin/pytest tests/ -q
```

External providers are mocked and infrastructure operations isolated in the automated tests. A real AssemblyAI key is required for live microphone transcription.

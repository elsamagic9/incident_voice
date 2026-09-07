from typing import Optional
from fastapi import APIRouter, Body
from fastapi.responses import Response
from app.core.config import settings
from app.core.state import cluster_state
from app.core.topology import get_service_topology
from app.services.lemur_service import lemur_service
from app.services.orchestrator import agent_orchestrator
from app.services.runbook_engine import runbook_engine
from app.services.blackbox_service import blackbox_service

router = APIRouter(prefix="/api")

@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "IncidentVoice Backend",
        "version": "1.0.0",
        "assemblyai_configured": bool(settings.assemblyai_api_key)
    }

@router.get("/cluster")
async def get_cluster_status():
    return {
        "incident": cluster_state.incident.model_dump(),
        "services": {k: v.model_dump() for k, v in cluster_state.services.items()}
    }

@router.post("/incident/reset")
async def reset_incident():
    cluster_state.reset_to_default_incident()
    agent_orchestrator.reset()
    runbook_engine.reset()
    blackbox_service.reset()
    return {
        "message": "Incident state reset successfully",
        "incident": cluster_state.incident.model_dump()
    }

@router.post("/incident/postmortem")
async def generate_postmortem():
    report = await lemur_service.generate_postmortem(
        transcript_history=agent_orchestrator.history,
        timeline_events=cluster_state.incident.timeline_events,
        incident_id=cluster_state.incident.id
    )
    return report

# =============================================================================
# Feature 1: SRE Runbook Workflow Endpoints
# =============================================================================
@router.get("/runbooks")
async def get_runbooks():
    return {"runbooks": runbook_engine.list_runbooks()}

@router.get("/runbooks/active")
async def get_active_runbook():
    return {"session": runbook_engine.get_active_session()}

@router.post("/runbooks/start")
async def start_runbook_endpoint(payload: dict = Body(...)):
    runbook_id = payload.get("runbook_id") or "runbook-pg-pool"
    spoken, session_data = runbook_engine.start_runbook(runbook_id)
    return {"spoken": spoken, "session": session_data}

@router.post("/runbooks/advance")
async def advance_runbook_endpoint():
    spoken, session_data, tools = runbook_engine.advance_runbook()
    return {"spoken": spoken, "session": session_data, "executed_tools": tools}

@router.post("/runbooks/abort")
async def abort_runbook_endpoint():
    spoken, session_data = runbook_engine.abort_runbook()
    return {"spoken": spoken, "session": session_data}

# =============================================================================
# Feature 2: Service Dependency Topology & Blast Radius Endpoint
# =============================================================================
@router.get("/topology")
async def get_topology_endpoint():
    return get_service_topology()

# =============================================================================
# Feature 3: Acoustic Incident Black Box Replay Endpoints
# =============================================================================
@router.get("/incident/blackbox")
async def get_incident_blackbox():
    return blackbox_service.get_blackbox_data()

@router.get("/incident/blackbox/audio.wav")
async def get_blackbox_audio():
    wav_bytes = blackbox_service.generate_synthetic_wav()
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "Content-Disposition": "inline; filename=incident-blackbox-INC-8942.wav",
            "Cache-Control": "no-cache"
        }
    )

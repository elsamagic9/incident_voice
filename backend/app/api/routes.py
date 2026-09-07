from fastapi import APIRouter
from app.core.config import settings
from app.core.state import cluster_state
from app.services.lemur_service import lemur_service
from app.services.orchestrator import agent_orchestrator

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
    agent_orchestrator.reset()
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

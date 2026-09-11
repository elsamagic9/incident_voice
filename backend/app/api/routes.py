from typing import Optional
from app.core.async_work import session_work
from fastapi import APIRouter, Body, Request, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import secrets
from app.core.session import create_session, find_session, sessions, SESSION_TTL, current_session
from app.core.http_session import COOKIE_NAME, origin_allowed
from fastapi.responses import Response
from app.core.config import settings
from app.core.state import cluster_state
from app.tools.sre_tools import get_service_topology
from app.services.lemur_service import lemur_service
from app.services.orchestrator import agent_orchestrator
from app.services.runbook_engine import runbook_engine
from app.services.blackbox_service import blackbox_service

router = APIRouter(prefix="/api")

class SessionLogin(BaseModel):
    access_token: str = ""

@router.post("/session")
async def open_session(request: Request, payload: SessionLogin = Body(default=SessionLogin())):
    if not origin_allowed(request):
        raise HTTPException(403, "Origin not allowed")
    existing = find_session(request.cookies.get(COOKIE_NAME))
    if settings.infrastructure_mode != "simulation" and not settings.operator_access_token:
        raise HTTPException(503, "Live infrastructure requires OPERATOR_ACCESS_TOKEN")
    if settings.operator_access_token and not (existing and existing.authenticated):
        if not secrets.compare_digest(payload.access_token, settings.operator_access_token):
            raise HTTPException(401, "An operator access token is required")
    try:
        session = existing or create_session(authenticated=bool(settings.operator_access_token))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    response = JSONResponse({"operator": session.operator, "role": session.role,
        "infrastructure_mode": settings.infrastructure_mode, "authenticated": session.authenticated,
        "assemblyai_configured": bool(settings.assemblyai_api_key), "tts_provider": settings.tts_provider})
    response.set_cookie(COOKIE_NAME, session.id, httponly=True, samesite="strict",
                        secure=settings.cookie_secure or request.url.scheme == "https", max_age=SESSION_TTL)
    response.headers["Cache-Control"] = "no-store"
    return response

@router.delete("/session")
async def close_session(request: Request):
    if not origin_allowed(request):
        raise HTTPException(403, "Origin not allowed")
    sessions.pop(request.cookies.get(COOKIE_NAME, ""), None)
    response = JSONResponse({"status": "signed_out"})
    response.delete_cookie(COOKIE_NAME)
    return response

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
    spoken, session_data = await session_work(runbook_engine.start_runbook, runbook_id)
    return {"spoken": spoken, "session": session_data}

@router.post("/runbooks/advance")
async def advance_runbook_endpoint():
    spoken, session_data, tools = await session_work(runbook_engine.advance_runbook)
    return {"spoken": spoken, "session": session_data, "executed_tools": tools}

@router.post("/runbooks/abort")
async def abort_runbook_endpoint():
    spoken, session_data = await session_work(runbook_engine.abort_runbook)
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
    wav_bytes = await session_work(blackbox_service.generate_wav)
    if not wav_bytes:
        raise HTTPException(404, "No microphone or agent audio has been recorded in this session")
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "Content-Disposition": "inline; filename=incident-blackbox-INC-8942.wav",
            "Cache-Control": "no-cache"
        }
    )

# =============================================================================
# Session Audit Ledger & Kubernetes Endpoints
# =============================================================================
@router.get("/audit-ledger")
async def get_audit_ledger():
    from app.services.audit_ledger import audit_ledger
    return audit_ledger.export_audit_manifest()

@router.get("/k8s/cluster")
async def get_k8s_cluster():
    from app.tools.k8s_adapter import k8s_adapter
    return await session_work(lambda: {
        "status": k8s_adapter.get_cluster_status(), "pods": k8s_adapter.list_pods()
    })

@router.get("/security/status")
async def get_security_status():
    from app.core.auth_rbac import security_manager
    return {
        "role": security_manager.current_role.value,
        "operator": security_manager.session_operator,
        "active_challenge": security_manager.active_challenge,
        "ttl_seconds": security_manager.challenge_ttl_seconds,
        "permissions": security_manager.get_current_permissions(),
        "authentication": "operator_token" if current_session.get().authenticated else "isolated_demo",
        "hardware_mfa": False
    }


@router.get("/incident/handoff")
async def export_handoff():
    from app.services.investigation import investigation_service
    return JSONResponse(investigation_service.export_handoff(), headers={
        'Content-Disposition': 'attachment; filename="incident-handoff.json"', 'Cache-Control': 'no-store'})

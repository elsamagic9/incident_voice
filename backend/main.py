import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.api.routes import router as api_router
from app.core.http_session import OperatorSessionMiddleware
from app.api.websocket import router as ws_router

from contextlib import asynccontextmanager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("incident_voice_main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.core.session_store import session_store
    expired = session_store.purge_expired()
    logger.info("Session storage ready; %s expired records removed. Sessions recover on authenticated access.", expired)
    yield

app = FastAPI(
    title="IncidentVoice API",
    description="Autonomous Voice SRE & Incident Commander powered by AssemblyAI Real-Time Voice AI and LeMUR",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(OperatorSessionMiddleware)

app.include_router(api_router)
app.include_router(ws_router)

# Mount frontend build if available
frontend_dist = os.path.join(os.path.dirname(__file__), "../frontend/dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting IncidentVoice backend on {settings.host}:{settings.port}")
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.debug)

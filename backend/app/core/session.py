"""Browser-owned state; async tasks and worker threads inherit the session context."""
import asyncio
import secrets
import time
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Callable

@dataclass
class OperatorSession:
    id: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    operator: str = "Demo operator"
    role: str = "SRE_COMMANDER"
    authenticated: bool = False
    created_at: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    services: dict[str, Any] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    connection_id: str | None = None

current_session: ContextVar[OperatorSession | None] = ContextVar("operator_session", default=None)

class SessionLocal:
    """Resolve existing service imports against a bound session, never global state."""
    def __init__(self, name: str, factory: Callable):
        object.__setattr__(self, "_name", name)
        object.__setattr__(self, "_factory", factory)

    def _get(self):
        session = current_session.get()
        if session is None:
            raise RuntimeError("An operator session must be bound before accessing incident state")
        if self._name not in session.services:
            session.services[self._name] = self._factory()
        return session.services[self._name]

    def __getattr__(self, name):
        return getattr(self._get(), name)

    def __setattr__(self, name, value):
        setattr(self._get(), name, value)

sessions: dict[str, OperatorSession] = {}
SESSION_TTL = 8 * 60 * 60

def find_session(session_id: str | None):
    session = sessions.get(session_id or "")
    if session and time.time() - session.created_at < SESSION_TTL:
        session.last_seen = time.time()
        return session
    if session:
        sessions.pop(session.id, None)
    return None

def create_session(authenticated: bool = False):
    for sid in list(sessions):
        find_session(sid)
    if len(sessions) >= 100:
        raise RuntimeError("Session capacity reached. Please retry later.")
    session = OperatorSession(authenticated=authenticated,
                              operator="Authenticated operator" if authenticated else "Demo operator")
    sessions[session.id] = session
    return session

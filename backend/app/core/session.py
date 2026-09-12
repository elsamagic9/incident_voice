"""Browser-owned state; async tasks and worker threads inherit the session context."""
import asyncio
import secrets
import time
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Callable
from app.core.config import settings

@dataclass
class OperatorSession:
    id: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    operator_id: str = "op-demo"
    operator: str = "Demo operator"
    role: str = "SRE_COMMANDER"
    authenticated: bool = False
    token_hash: str = ""
    infrastructure_mode: str = field(default_factory=lambda: settings.infrastructure_mode)
    mutation_in_flight: dict | None = None
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
    from app.core.session_store import session_store
    session = sessions.get(session_id or "")
    if not session and session_id:
        session = session_store.load(session_id)
        if session:
            sessions[session.id] = session
    if session and time.time() - session.created_at < SESSION_TTL:
        from app.core.auth_rbac import operator_registry
        if not operator_registry.session_is_valid(session):
            sessions.pop(session.id, None)
            session_store.delete(session.id)
            return None
        session.last_seen = time.time()
        return session
    if session:
        sessions.pop(session.id, None)
        session_store.delete(session.id)
    return None

def create_session(operator=None, authenticated: bool = False, role: str = "SRE_COMMANDER"):
    for sid in list(sessions):
        find_session(sid)
    from app.core.session_store import session_store
    session_store.purge_expired()
    if len(sessions) >= 100 or session_store.active_count() >= 100:
        raise RuntimeError("Session capacity reached. Please retry later.")
    if operator is not None:
        role_val = operator.role.value if hasattr(operator.role, "value") else str(operator.role)
        session = OperatorSession(
            authenticated=True,
            operator_id=operator.operator_id,
            operator=operator.name,
            role=role_val,
            token_hash=getattr(operator, "token_hash", "")
        )
    else:
        session = OperatorSession(
            authenticated=authenticated,
            operator_id="op-authenticated" if authenticated else "op-demo",
            operator="Authenticated operator" if authenticated else "Demo operator",
            role=role if authenticated else "SRE_COMMANDER"
        )
    from app.core.session_store import session_store
    session_store.save(session)
    sessions[session.id] = session
    return session


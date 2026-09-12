import re
import secrets
import time
from contextlib import contextmanager
from contextvars import ContextVar
from enum import Enum
from dataclasses import dataclass, field
import hashlib
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional
from app.core.session import SessionLocal, current_session

class SRERole(str, Enum):
    SRE_COMMANDER = 'SRE_COMMANDER'
    INCIDENT_RESPONDER = 'INCIDENT_RESPONDER'
    READ_ONLY_OBSERVER = 'READ_ONLY_OBSERVER'

READ_ACTIONS = {'get_cluster_health', 'check_cluster_health', 'inspect_service_logs', 'query_telemetry',
                'query_metrics', 'query_host_telemetry', 'list_runbooks', 'get_service_topology', 'k8s_list_pods', 'generate_postmortem', 'investigate_incident', 'verify_recovery',
                'search_web_or_docs', 'inspect_document', 'transcribe_media_recording', 'retrieve_incident_memory',
                'locate_causal_root_cause', 'match_historical_incident', 'plan_mitigation_tree', 'export_incident_report'}
MUTATIONS = {'restart_pod', 'flush_cache', 'rollback_release', 'scale_replicas', 'enable_circuit_breaker',
             'failover_traffic', 'cordon_node', 'k8s_rollout_restart'}
ROLE_PERMISSIONS = {
    SRERole.READ_ONLY_OBSERVER: sorted(READ_ACTIONS),
    SRERole.INCIDENT_RESPONDER: sorted(READ_ACTIONS | {'start_runbook', 'advance_runbook', 'abort_runbook', 'scale_replicas'}),
    SRERole.SRE_COMMANDER: sorted(READ_ACTIONS | MUTATIONS | {'start_runbook', 'advance_runbook', 'abort_runbook', 'trigger_pager'}),
}

@dataclass
class Operator:
    """An explicitly provisioned operator and its assigned role."""
    operator_id: str
    name: str
    role: SRERole
    token_hash: str
    revoked: bool = False
    created_at: float = field(default_factory=time.time)

    def to_dict(self, include_sensitive: bool = False) -> Dict[str, Any]:
        data = {
            "operator_id": self.operator_id,
            "name": self.name,
            "role": self.role.value if isinstance(self.role, SRERole) else str(self.role),
            "revoked": self.revoked,
            "created_at": self.created_at,
        }
        if include_sensitive:
            data["token_hash"] = self.token_hash
        return data

class OperatorRegistry:
    """Explicit identities; SQLite transactions retain rotations and revocations.

    No sample credentials are installed. A missing path gives an isolated in-memory
    directory for tests; the application singleton uses the configured data volume.
    """
    CONFIGURED_ID = 'op-configured-commander'

    def __init__(self, path=None):
        if path is not None:
            path = Path(path)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch(mode=0o600, exist_ok=True)
            path.chmod(0o600)
        self._lock = threading.RLock()
        self._db = sqlite3.connect(str(path) if path else ':memory:', check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        with self._db:
            self._db.execute("PRAGMA synchronous=FULL")
            self._db.execute("""CREATE TABLE IF NOT EXISTS operators (
                operator_id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE, revoked INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL)""")
            self._db.execute("CREATE TABLE IF NOT EXISTS revoked_tokens (token_hash TEXT PRIMARY KEY)")
        if path:
            path.chmod(0o600)

    @staticmethod
    def _hash_token(token):
        return hashlib.sha256(token.encode('utf-8')).hexdigest()

    @staticmethod
    def _operator(row):
        if row is None:
            return None
        return Operator(row['operator_id'], row['name'], SRERole(row['role']),
                        row['token_hash'], bool(row['revoked']), row['created_at'])

    def register_operator(self, operator_id: str, name: str, role: SRERole, raw_token: str) -> Operator:
        if not operator_id or operator_id in {'op-demo', 'op-authenticated'} or not name.strip() or not raw_token:
            raise ValueError('A distinct operator ID, name and nonempty token are required')
        role = SRERole(role)
        token_h = self._hash_token(raw_token)
        with self._lock, self._db:
            if self._db.execute('SELECT 1 FROM revoked_tokens WHERE token_hash=?', (token_h,)).fetchone():
                raise ValueError('A revoked credential cannot be reused; supply a new token')
            duplicate = self._db.execute('SELECT operator_id FROM operators WHERE token_hash=?', (token_h,)).fetchone()
            if duplicate and duplicate['operator_id'] != operator_id:
                raise ValueError('A credential cannot be shared between operators')
            old = self._db.execute('SELECT * FROM operators WHERE operator_id=?', (operator_id,)).fetchone()
            if old and old['token_hash'] != token_h:
                self._db.execute('INSERT OR IGNORE INTO revoked_tokens VALUES (?)', (old['token_hash'],))
            self._db.execute("""INSERT INTO operators VALUES (?, ?, ?, ?, 0, ?)
                ON CONFLICT(operator_id) DO UPDATE SET name=excluded.name,
                role=excluded.role, token_hash=excluded.token_hash, revoked=0""",
                (operator_id, name, role.value, token_h, time.time()))
        return self.get_operator(operator_id)

    def authenticate(self, raw_token: str) -> Optional[Operator]:
        from app.core.config import settings
        if not raw_token:
            return None
        token_h = self._hash_token(raw_token)
        with self._lock:
            if self._db.execute('SELECT 1 FROM revoked_tokens WHERE token_hash=?', (token_h,)).fetchone():
                return None
            if settings.operator_access_token and secrets.compare_digest(raw_token, settings.operator_access_token):
                op = self.get_operator(self.CONFIGURED_ID)
                if not op or op.token_hash != token_h:
                    op = self.register_operator(self.CONFIGURED_ID, 'Configured SRE Commander', SRERole.SRE_COMMANDER, raw_token)
                return None if op.revoked else op
            row = self._db.execute('SELECT * FROM operators WHERE token_hash=? AND revoked=0', (token_h,)).fetchone()
            op = self._operator(row)
            # Removing or rotating the environment secret must invalidate its old identity.
            return op if op and op.operator_id != self.CONFIGURED_ID else None

    def get_operator(self, operator_id: str) -> Optional[Operator]:
        with self._lock:
            return self._operator(self._db.execute('SELECT * FROM operators WHERE operator_id=?', (operator_id,)).fetchone())

    def revoke_operator(self, operator_id: str) -> bool:
        with self._lock, self._db:
            op = self.get_operator(operator_id)
            if not op:
                return False
            self._db.execute('UPDATE operators SET revoked=1 WHERE operator_id=?', (operator_id,))
            self._db.execute('INSERT OR IGNORE INTO revoked_tokens VALUES (?)', (op.token_hash,))
        return True

    def revoke_token(self, raw_token: str) -> bool:
        if not raw_token:
            return False
        token_h = self._hash_token(raw_token)
        with self._lock, self._db:
            self._db.execute('INSERT OR IGNORE INTO revoked_tokens VALUES (?)', (token_h,))
            self._db.execute('UPDATE operators SET revoked=1 WHERE token_hash=?', (token_h,))
        return True

    def is_revoked(self, operator_id: str) -> bool:
        with self._lock:
            op = self.get_operator(operator_id)
            return not op or op.revoked or bool(self._db.execute(
                'SELECT 1 FROM revoked_tokens WHERE token_hash=?', (op.token_hash,)).fetchone())

    def requires_authentication(self):
        from app.core.config import settings
        with self._lock:
            configured = bool(self._db.execute('SELECT 1 FROM operators LIMIT 1').fetchone())
        return settings.infrastructure_mode != 'simulation' or bool(settings.operator_access_token) or configured

    def session_is_valid(self, session):
        from app.core.config import settings
        if not session:
            return False
        if session.operator_id == 'op-demo':
            return not self.requires_authentication()
        op = self.get_operator(session.operator_id)
        if not session.authenticated or not op or self.is_revoked(op.operator_id):
            return False
        if not session.token_hash or not secrets.compare_digest(session.token_hash, op.token_hash):
            return False
        if session.role != op.role.value:
            return False
        if op.operator_id == self.CONFIGURED_ID:
            return bool(settings.operator_access_token) and secrets.compare_digest(
                op.token_hash, self._hash_token(settings.operator_access_token))
        return True

    def list_operators(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [self._operator(row).to_dict() for row in self._db.execute('SELECT * FROM operators ORDER BY created_at')]

from app.core.config import settings
operator_registry = OperatorRegistry(Path(settings.wal_storage_dir) / 'operators.sqlite3')

NATO_PHONETIC_WORDS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'Xray', 'Yankee', 'Zulu']
PHONETIC_DIGITS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Niner']

def normalize_speech(text):
    return ' '.join(re.sub(r'[^a-z0-9\s]', ' ', text.lower()).split())

def is_cancellation(text):
    return bool(re.search(r"\b(no|not|never|cancel|abort|stop|negative|dismiss|wait|hold)\b|don['’]?t|do\s+not", text.lower()))

class EnterpriseSecurityManager:
    def __init__(self, default_role=None):
        session = current_session.get()
        self._session = session
        if session and session.operator_id:
            op = operator_registry.get_operator(session.operator_id)
            if op and not op.revoked:
                self.operator_id = op.operator_id
                self.session_operator = op.name
                self.current_role = op.role
            else:
                self.operator_id = session.operator_id
                self.session_operator = session.operator
                self.current_role = SRERole(session.role) if session.role in SRERole.__members__ else SRERole.READ_ONLY_OBSERVER
        else:
            self.operator_id = 'op-demo'
            self.session_operator = session.operator if session else 'Unauthenticated'
            self.current_role = default_role or SRERole(session.role if session else SRERole.READ_ONLY_OBSERVER)
        self.active_challenge = None
        self.challenge_created_at = 0.0
        self.challenge_ttl_seconds = 30.0

    def is_action_permitted(self, action, role=None):
        if not operator_registry.session_is_valid(self._session):
            return False
        allowed = ROLE_PERMISSIONS.get(self.current_role, [])
        return action in allowed and (role is None or action in ROLE_PERMISSIONS.get(role, []))

    def get_current_permissions(self):
        if not operator_registry.session_is_valid(self._session):
            return []
        return ROLE_PERMISSIONS.get(self.current_role, [])

    def generate_phonetic_challenge(self):
        self.active_challenge = '-'.join([secrets.choice(NATO_PHONETIC_WORDS), secrets.choice(PHONETIC_DIGITS), secrets.choice(NATO_PHONETIC_WORDS)])
        self.challenge_created_at = time.time()
        return self.active_challenge

    def verify_vocal_authorization(self, text):
        if not operator_registry.session_is_valid(self._session):
            self.clear_challenge()
            return False, 'Operator credentials have been revoked.'
        if not self.active_challenge or time.time() - self.challenge_created_at > self.challenge_ttl_seconds:
            self.clear_challenge()
            return False, 'Authorization expired or missing.'
        if is_cancellation(text):
            return False, 'Cancellation or negation detected.'
        normalized = normalize_speech(text)
        challenge = normalize_speech(self.active_challenge)
        accepted = {
            'confirm', 'authorize', 'approve', 'yes confirm', 'confirm action',
            'authorize action', 'confirm remediation', 'authorize remediation',
            challenge, f'confirm {challenge}', f'authorize {challenge}'
        }
        verified = normalized in accepted
        return verified, 'Explicit confirmation verified.' if verified else 'Explicit confirmation required.'

    def clear_challenge(self):
        self.active_challenge = None
        self.challenge_created_at = 0.0

_mutation_grant = ContextVar('mutation_grant', default=None)

@contextmanager
def authorized_mutation(action, target):
    token = _mutation_grant.set({'action': action, 'target': target, 'used': False})
    try:
        yield
    finally:
        _mutation_grant.reset(token)

def consume_mutation_grant(action, target):
    grant = _mutation_grant.get()
    if not security_manager.is_action_permitted(action):
        return False
    if not grant or grant['used'] or (grant['action'], grant['target']) != (action, target):
        return False
    grant['used'] = True
    return True

security_manager = SessionLocal('security', EnterpriseSecurityManager)

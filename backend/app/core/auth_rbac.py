import re
import secrets
import time
from contextlib import contextmanager
from contextvars import ContextVar
from enum import Enum
from dataclasses import dataclass, field
import hashlib
from typing import Any, Dict, List, Optional
from app.core.session import SessionLocal, current_session

class SRERole(str, Enum):
    SRE_COMMANDER = 'SRE_COMMANDER'
    INCIDENT_RESPONDER = 'INCIDENT_RESPONDER'
    READ_ONLY_OBSERVER = 'READ_ONLY_OBSERVER'

READ_ACTIONS = {'get_cluster_health', 'check_cluster_health', 'inspect_service_logs', 'query_telemetry',
                'query_metrics', 'query_host_telemetry', 'list_runbooks', 'get_service_topology', 'k8s_list_pods', 'generate_postmortem', 'investigate_incident', 'verify_recovery'}
MUTATIONS = {'restart_pod', 'flush_cache', 'rollback_release', 'scale_replicas', 'enable_circuit_breaker',
             'failover_traffic', 'cordon_node', 'k8s_rollout_restart'}
ROLE_PERMISSIONS = {
    SRERole.READ_ONLY_OBSERVER: sorted(READ_ACTIONS),
    SRERole.INCIDENT_RESPONDER: sorted(READ_ACTIONS | {'start_runbook', 'advance_runbook', 'abort_runbook', 'scale_replicas'}),
    SRERole.SRE_COMMANDER: sorted(READ_ACTIONS | MUTATIONS | {'start_runbook', 'advance_runbook', 'abort_runbook', 'trigger_pager'}),
}

@dataclass
class Operator:
    """Individual operator identity conforming to Saltzer & Schroeder (1975) and RBAC96."""
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
    """
    Central directory of individual operator identities and role authorizations.
    Enforces complete mediation, fail-safe defaults, and token revocation.
    """
    def __init__(self):
        self._operators: Dict[str, Operator] = {}
        self._token_to_id: Dict[str, str] = {}
        self._revoked_tokens: set[str] = set()
        self._initialize_defaults()

    def _hash_token(self, token: str) -> str:
        return hashlib.sha256(token.encode('utf-8')).hexdigest()

    def _initialize_defaults(self):
        # Pre-configured operators for multi-operator SRE triage
        self.register_operator('op-sarah-chen', 'Sarah Chen (Principal SRE)', SRERole.SRE_COMMANDER, 'token-commander-sarah')
        self.register_operator('op-alex-rivera', 'Alex Rivera (On-Call SRE)', SRERole.INCIDENT_RESPONDER, 'token-responder-alex')
        self.register_operator('op-jordan-lee', 'Jordan Lee (Security Auditor)', SRERole.READ_ONLY_OBSERVER, 'token-observer-jordan')

    def register_operator(self, operator_id: str, name: str, role: SRERole, raw_token: str) -> Operator:
        token_h = self._hash_token(raw_token)
        op = Operator(
            operator_id=operator_id,
            name=name,
            role=role if isinstance(role, SRERole) else SRERole(role),
            token_hash=token_h,
            revoked=False
        )
        self._operators[operator_id] = op
        self._token_to_id[token_h] = operator_id
        return op

    def authenticate(self, raw_token: str) -> Optional[Operator]:
        if not raw_token:
            return None
        token_h = self._hash_token(raw_token)
        if token_h in self._revoked_tokens:
            return None
        op_id = self._token_to_id.get(token_h)
        if op_id:
            op = self._operators.get(op_id)
            if op and not op.revoked:
                return op
            return None

        # Check legacy configured operator_access_token fallback
        from app.core.config import settings
        if settings.operator_access_token and secrets.compare_digest(raw_token, settings.operator_access_token):
            if 'op-configured-commander' not in self._operators:
                self.register_operator('op-configured-commander', 'Configured SRE Commander', SRERole.SRE_COMMANDER, settings.operator_access_token)
            return self._operators['op-configured-commander']

        return None

    def get_operator(self, operator_id: str) -> Optional[Operator]:
        return self._operators.get(operator_id)

    def revoke_operator(self, operator_id: str) -> bool:
        op = self._operators.get(operator_id)
        if not op:
            return False
        op.revoked = True
        self._revoked_tokens.add(op.token_hash)
        return True

    def revoke_token(self, raw_token: str) -> bool:
        token_h = self._hash_token(raw_token)
        self._revoked_tokens.add(token_h)
        op_id = self._token_to_id.get(token_h)
        if op_id and op_id in self._operators:
            self._operators[op_id].revoked = True
            return True
        return True

    def is_revoked(self, operator_id: str) -> bool:
        op = self._operators.get(operator_id)
        if not op:
            return False
        return op.revoked or op.token_hash in self._revoked_tokens

    def list_operators(self) -> List[Dict[str, Any]]:
        return [op.to_dict() for op in self._operators.values()]

operator_registry = OperatorRegistry()

NATO_PHONETIC_WORDS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'Xray', 'Yankee', 'Zulu']
PHONETIC_DIGITS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Niner']

def normalize_speech(text):
    return ' '.join(re.sub(r'[^a-z0-9\s]', ' ', text.lower()).split())

def is_cancellation(text):
    return bool(re.search(r"\b(no|not|never|cancel|abort|stop|negative|dismiss|wait|hold)\b|don['’]?t|do\s+not", text.lower()))

class EnterpriseSecurityManager:
    def __init__(self, default_role=None):
        session = current_session.get()
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
        if self.operator_id and operator_registry.is_revoked(self.operator_id):
            return False
        target_role = role or self.current_role
        return action in ROLE_PERMISSIONS.get(target_role, [])

    def get_current_permissions(self):
        if self.operator_id and operator_registry.is_revoked(self.operator_id):
            return []
        return ROLE_PERMISSIONS.get(self.current_role, [])

    def generate_phonetic_challenge(self):
        self.active_challenge = '-'.join([secrets.choice(NATO_PHONETIC_WORDS), secrets.choice(PHONETIC_DIGITS), secrets.choice(NATO_PHONETIC_WORDS)])
        self.challenge_created_at = time.time()
        return self.active_challenge

    def verify_vocal_authorization(self, text):
        if self.operator_id and operator_registry.is_revoked(self.operator_id):
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

import re
import secrets
import time
from contextlib import contextmanager
from contextvars import ContextVar
from enum import Enum
from app.core.session import SessionLocal, current_session

class SRERole(str, Enum):
    SRE_COMMANDER = 'SRE_COMMANDER'
    INCIDENT_RESPONDER = 'INCIDENT_RESPONDER'
    READ_ONLY_OBSERVER = 'READ_ONLY_OBSERVER'

READ_ACTIONS = {'get_cluster_health', 'check_cluster_health', 'inspect_service_logs', 'query_telemetry',
                'query_metrics', 'query_host_telemetry', 'list_runbooks', 'get_service_topology', 'k8s_list_pods', 'generate_postmortem'}
MUTATIONS = {'restart_pod', 'flush_cache', 'rollback_release', 'scale_replicas', 'enable_circuit_breaker',
             'failover_traffic', 'cordon_node', 'k8s_rollout_restart'}
ROLE_PERMISSIONS = {
    SRERole.READ_ONLY_OBSERVER: sorted(READ_ACTIONS),
    SRERole.INCIDENT_RESPONDER: sorted(READ_ACTIONS | {'start_runbook', 'advance_runbook', 'abort_runbook', 'scale_replicas'}),
    SRERole.SRE_COMMANDER: sorted(READ_ACTIONS | MUTATIONS | {'start_runbook', 'advance_runbook', 'abort_runbook', 'trigger_pager'}),
}
NATO_PHONETIC_WORDS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'Xray', 'Yankee', 'Zulu']
PHONETIC_DIGITS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Niner']

def normalize_speech(text):
    return ' '.join(re.sub(r'[^a-z0-9\s]', ' ', text.lower()).split())

def is_cancellation(text):
    return bool(re.search(r"\b(no|not|never|cancel|abort|stop|negative|dismiss|wait|hold)\b|don['’]?t|do\s+not", text.lower()))

class EnterpriseSecurityManager:
    def __init__(self, default_role=None):
        session = current_session.get()
        self.current_role = default_role or SRERole(session.role if session else SRERole.READ_ONLY_OBSERVER)
        self.session_operator = session.operator if session else 'Unauthenticated'
        self.active_challenge = None
        self.challenge_created_at = 0.0
        self.challenge_ttl_seconds = 30.0

    def is_action_permitted(self, action, role=None):
        return action in ROLE_PERMISSIONS.get(role or self.current_role, [])

    def get_current_permissions(self):
        return ROLE_PERMISSIONS.get(self.current_role, [])

    def generate_phonetic_challenge(self):
        self.active_challenge = '-'.join([secrets.choice(NATO_PHONETIC_WORDS), secrets.choice(PHONETIC_DIGITS), secrets.choice(NATO_PHONETIC_WORDS)])
        self.challenge_created_at = time.time()
        return self.active_challenge

    def verify_vocal_authorization(self, text):
        if not self.active_challenge or time.time() - self.challenge_created_at > self.challenge_ttl_seconds:
            self.clear_challenge()
            return False, 'Authorization expired or missing.'
        if is_cancellation(text):
            return False, 'Cancellation or negation detected.'
        normalized = normalize_speech(text)
        challenge = normalize_speech(self.active_challenge)
        accepted = {'confirm', 'authorize', 'approve', 'yes confirm', 'confirm action', challenge, f'confirm {challenge}', f'authorize {challenge}'}
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

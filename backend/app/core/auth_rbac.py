import random
import re
import time
from enum import Enum
from typing import Dict, Any, List, Optional, Tuple

class SRERole(str, Enum):
    SRE_COMMANDER = "SRE_COMMANDER"           # Full cluster privileges, destructive mutations allowed
    INCIDENT_RESPONDER = "INCIDENT_RESPONDER" # Can triage, run runbooks, non-destructive mitigations
    READ_ONLY_OBSERVER = "READ_ONLY_OBSERVER" # Telemetry, metrics, logs only

# Action permission matrix
ROLE_PERMISSIONS: Dict[SRERole, List[str]] = {
    SRERole.SRE_COMMANDER: [
        "check_cluster_health",
        "inspect_service_logs",
        "query_metrics",
        "start_runbook",
        "advance_runbook",
        "abort_runbook",
        "restart_pod",
        "flush_cache",
        "rollback_release",
        "scale_service",
        "cordon_node",
        "k8s_rollout_restart"
    ],
    SRERole.INCIDENT_RESPONDER: [
        "check_cluster_health",
        "inspect_service_logs",
        "query_metrics",
        "start_runbook",
        "advance_runbook",
        "abort_runbook",
        "scale_service"
    ],
    SRERole.READ_ONLY_OBSERVER: [
        "check_cluster_health",
        "inspect_service_logs",
        "query_metrics"
    ]
}

NATO_PHONETIC_WORDS = [
    "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot",
    "Golf", "Hotel", "India", "Juliet", "Kilo", "Lima",
    "Mike", "November", "Oscar", "Papa", "Quebec", "Romeo",
    "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "X-Ray",
    "Yankee", "Zulu"
]

PHONETIC_DIGITS = [
    "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Niner"
]

class EnterpriseSecurityManager:
    """
    Zero-Trust Security Manager enforcing:
    1. Role-Based Access Control (RBAC)
    2. Dynamic Phonetic Challenge-Response Authorization
    3. Session authorization tracking
    """

    def __init__(self, default_role: SRERole = SRERole.SRE_COMMANDER):
        self.current_role = default_role
        self.session_operator = "Commander-01 (Lead SRE)"
        self.active_challenge: Optional[str] = None
        self.challenge_created_at: float = 0
        self.challenge_ttl_seconds: float = 30.0

    def is_action_permitted(self, action: str, role: Optional[SRERole] = None) -> bool:
        """Verifies if the specified role has permissions to execute an action."""
        check_role = role or self.current_role
        allowed_actions = ROLE_PERMISSIONS.get(check_role, [])
        return action in allowed_actions

    def get_current_permissions(self) -> List[str]:
        """Returns list of allowed actions for current role."""
        return ROLE_PERMISSIONS.get(self.current_role, [])

    def generate_phonetic_challenge(self) -> str:
        """
        Generates a 3-part phonetic military challenge code.
        Example: 'Delta-9-Bravo' or 'Sierra-4-Niner'
        """
        w1 = random.choice(NATO_PHONETIC_WORDS)
        d = random.choice(PHONETIC_DIGITS)
        w2 = random.choice(NATO_PHONETIC_WORDS)
        challenge = f"{w1}-{d}-{w2}"
        self.active_challenge = challenge
        self.challenge_created_at = time.time()
        return challenge

    def verify_vocal_authorization(self, user_transcript: str) -> Tuple[bool, str]:
        """
        Validates if the user utterance authorizes the staged remediation.
        Accepts:
        1. Exact or fuzzy phonetic challenge code (e.g. 'Delta-9-Bravo' or 'Delta 9 Bravo')
        2. 'Confirm' + challenge code
        3. Standard 'Confirm' / 'Authorize' if challenge is active (graceful fallback)
        """
        if not self.active_challenge:
            return False, "No active challenge staged."

        now = time.time()
        if now - self.challenge_created_at > self.challenge_ttl_seconds:
            self.active_challenge = None
            return False, "Authorization challenge expired (30-second TTL exceeded)."

        transcript_lower = user_transcript.lower().replace("-", " ")
        parts = [p.lower() for p in self.active_challenge.split("-")]

        # Check full challenge match
        all_parts_present = all(p in transcript_lower for p in parts)
        if all_parts_present:
            self.active_challenge = None
            return True, "Phonetic security challenge successfully verified."

        # Check explicit affirmative confirmation keywords
        affirmative = any(w in transcript_lower for w in ["confirm", "authorize", "proceed", "approved"])
        if affirmative:
            self.active_challenge = None
            return True, "Vocal authorization accepted."

        return False, "Utterance did not match the authorization challenge."

    def clear_challenge(self):
        self.active_challenge = None
        self.challenge_created_at = 0

security_manager = EnterpriseSecurityManager()

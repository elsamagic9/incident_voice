import hashlib
import json
import time
import threading
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

class CryptographicAuditLedger:
    """
    In-memory, tamper-evident SHA-256 audit chain. Not a compliance certification.
    Every voice command, staged remediation, phonetic authorization, and
    infrastructure mutation is cryptographically linked using SHA-256 blocks.
    Thread-safe via internal lock to prevent concurrent chain corruption.
    """

    GENESIS_HASH = "0" * 64

    def __init__(self):
        self._lock = threading.Lock()
        self.blocks: List[Dict[str, Any]] = []
        # Create genesis block
        self._create_genesis_block()

    @property
    def chain(self) -> List[Dict[str, Any]]:
        return self.blocks

    def _compute_hash(self, block_data: Dict[str, Any]) -> str:
        """Computes deterministic SHA-256 hash of block contents."""
        serialized = json.dumps(block_data, sort_keys=True, separators=(',', ':'))
        return hashlib.sha256(serialized.encode('utf-8')).hexdigest()

    def _create_genesis_block(self):
        genesis_payload = {
            "block_index": 0,
            "timestamp_iso": datetime.now(timezone.utc).isoformat(),
            "actor": "SYSTEM_CORE",
            "role": "SECURITY_ROOT",
            "event_type": "AUDIT_LEDGER_INITIALIZED",
            "action": "INIT",
            "details": {
                "compliance_standard": "No compliance certification",
                "hashing_algorithm": "SHA-256 hash chain",
                "zero_trust_policy": "Session-scoped"
            },
            "prev_hash": self.GENESIS_HASH
        }
        genesis_payload["block_hash"] = self._compute_hash(genesis_payload)
        self.blocks.append(genesis_payload)

    def record_event(
        self,
        event_type: str,
        actor: str,
        role: str,
        action: str,
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Appends an event to the immutable hash chain.
        """
        with self._lock:
            prev_block = self.blocks[-1]
            prev_hash = prev_block["block_hash"]
            block_index = len(self.blocks)

            block_payload = {
                "block_index": block_index,
                "timestamp_iso": datetime.now(timezone.utc).isoformat(),
                "actor": actor,
                "role": role,
                "event_type": event_type,
                "action": action,
                "details": details or {},
                "prev_hash": prev_hash
            }
            block_hash = self._compute_hash(block_payload)
            block_payload["block_hash"] = block_hash

            self.blocks.append(block_payload)
            return block_payload

    def verify_chain_integrity(self) -> Tuple[bool, int, Optional[str]]:
        """
        Cryptographically audits every block in the ledger.
        Returns:
            (is_valid, total_blocks_audited, failure_reason_if_any)
        """
        if not self.blocks:
            return False, 0, "Ledger is empty"

        # Check genesis
        genesis = self.blocks[0]
        if genesis["prev_hash"] != self.GENESIS_HASH:
            return False, 0, "Genesis previous hash invalid"

        for i in range(len(self.blocks)):
            current = self.blocks[i]
            # Verify hash computation
            expected_hash = current["block_hash"]
            # Recompute without block_hash
            payload_to_verify = {k: v for k, v in current.items() if k != "block_hash"}
            recomputed = self._compute_hash(payload_to_verify)
            if recomputed != expected_hash:
                return False, i, f"Block {i} hash tampered: expected {expected_hash}, recomputed {recomputed}"

            # Verify chain link
            if i > 0:
                prev = self.blocks[i - 1]
                if current["prev_hash"] != prev["block_hash"]:
                    return False, i, f"Block {i} broken chain link: prev_hash does not match block {i-1}"

        return True, len(self.blocks), None

    def get_ledger_entries(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Returns recent ledger blocks in reverse chronological order."""
        return list(reversed(self.blocks[-limit:]))

    def export_audit_manifest(self) -> Dict[str, Any]:
        """
        Exports the session hash chain and its current integrity result.
        """
        is_valid, count, failure = self.verify_chain_integrity()
        latest_hash = self.blocks[-1]["block_hash"] if self.blocks else None

        return {
            "compliance_certification": "No compliance certification; in-memory hash chain",
            "chain_status": "TAMPER_EVIDENT_VALID" if is_valid else "TAMPERING_DETECTED",
            "total_cryptographic_blocks": count,
            "merkle_leaf_root_hash": latest_hash,
            "audit_timestamp": datetime.now(timezone.utc).isoformat(),
            "failure_details": failure,
            "blocks": self.blocks
        }

from app.core.session import SessionLocal
audit_ledger = SessionLocal("audit", CryptographicAuditLedger)

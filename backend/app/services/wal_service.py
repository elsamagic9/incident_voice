"""Write-Ahead Logging (WAL) service implementing ARIES crash-recovery principles.

Ensures that all incident mutations, timeline events, investigation baselines,
and cryptographic audit blocks are persisted to an append-only log before state
changes take effect or responses are returned.
"""
import hashlib
import json
import os
import threading
import time
from typing import Any, Dict, List, Optional, Tuple
from app.core.config import settings


class WriteAheadLogService:
    def __init__(self, storage_dir: Optional[str] = None):
        self._lock = threading.Lock()
        self.storage_dir = storage_dir or settings.wal_storage_dir
        self.last_lsn = 0
        self.in_memory = self.storage_dir == ":memory:"
        self.memory_records: List[Dict[str, Any]] = []
        if not self.in_memory:
            os.makedirs(self.storage_dir, exist_ok=True)
            self.wal_path = os.path.join(self.storage_dir, "incident_wal.jsonl")
            self._init_lsn()

    def _init_lsn(self):
        if not os.path.exists(self.wal_path):
            self.last_lsn = 0
            return
        last = 0
        try:
            with open(self.wal_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            rec = json.loads(line)
                            last = max(last, rec.get("lsn", 0))
                        except Exception:
                            pass
        except Exception:
            pass
        self.last_lsn = last

    def _compute_checksum(self, lsn: int, prev_lsn: int, timestamp: float, record_type: str, payload: Any) -> str:
        body = json.dumps({"lsn": lsn, "prev_lsn": prev_lsn, "timestamp": timestamp, "type": record_type, "payload": payload}, sort_keys=True)
        return hashlib.sha256(body.encode("utf-8")).hexdigest()

    def append(self, record_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Appends a write-ahead log record with monotonic LSN and fsync."""
        with self._lock:
            lsn = self.last_lsn + 1
            prev_lsn = self.last_lsn
            now = time.time()
            checksum = self._compute_checksum(lsn, prev_lsn, now, record_type, payload)
            record = {
                "lsn": lsn,
                "prev_lsn": prev_lsn,
                "timestamp": now,
                "type": record_type,
                "payload": payload,
                "checksum": checksum,
            }
            if self.in_memory:
                self.memory_records.append(record)
            else:
                with open(self.wal_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(record) + "\n")
                    f.flush()
                    os.fsync(f.fileno())
            self.last_lsn = lsn
            return record

    def read_records(self) -> List[Dict[str, Any]]:
        """Reads all verified records from the WAL."""
        with self._lock:
            if self.in_memory:
                return list(self.memory_records)
            if not os.path.exists(self.wal_path):
                return []
            records = []
            with open(self.wal_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                        expected = self._compute_checksum(
                            rec["lsn"], rec["prev_lsn"], rec["timestamp"], rec["type"], rec["payload"]
                        )
                        if rec.get("checksum") == expected:
                            records.append(rec)
                    except Exception:
                        pass
            return records

    def replay_into_state(self, state, audit_ledger=None, investigation=None) -> Dict[str, Any]:
        """Executes ARIES-style recovery:

        1. Analysis pass: identifies all records up to crash point.
        2. Redo pass: repeats history, restoring incident timeline, mitigations,
           and audit hash chain blocks.
        3. Undo pass: identifies any staged mutations that lack confirmation,
           cleanly rolling them back.
        """
        records = self.read_records()
        staged_mutations: Dict[str, Dict[str, Any]] = {}
        confirmed_mutations = set()
        recovered_events = 0

        for rec in records:
            rtype = rec["type"]
            payload = rec["payload"]

            if rtype == "TIMELINE_EVENT":
                state.incident.timeline_events.append(payload)
                recovered_events += 1
            elif rtype == "INCIDENT_STATUS":
                state.incident.status = payload.get("status", state.incident.status)
                if "resolved_at" in payload:
                    state.incident.resolved_at = payload["resolved_at"]
            elif rtype == "MITIGATION_APPLIED":
                action = payload.get("action")
                if action and action not in state.incident.mitigations_applied:
                    state.incident.mitigations_applied.append(action)
            elif rtype == "AUDIT_BLOCK" and audit_ledger is not None:
                block_index = payload.get("block_index")
                if block_index == 0:
                    if audit_ledger.blocks:
                        audit_ledger.blocks[0] = payload
                    else:
                        audit_ledger.blocks.append(payload)
                elif block_index == len(audit_ledger.blocks):
                    audit_ledger.blocks.append(payload)
            elif rtype == "INVESTIGATION_BASELINE" and investigation is not None:
                investigation.brief = payload
            elif rtype == "STAGE_MUTATION":
                staged_id = payload.get("id")
                if staged_id:
                    staged_mutations[staged_id] = payload
            elif rtype == "CONFIRM_MUTATION":
                staged_id = payload.get("id")
                if staged_id:
                    confirmed_mutations.add(staged_id)

        # ARIES Undo pass: unconfirmed staged mutations are rolled back (expired)
        uncommitted = [m_id for m_id in staged_mutations if m_id not in confirmed_mutations]

        return {
            "recovered_records": len(records),
            "recovered_timeline_events": recovered_events,
            "uncommitted_staged_mutations_rolled_back": uncommitted,
            "last_lsn": self.last_lsn,
        }

    def reset(self):
        """Truncates the WAL (for testing or incident reset)."""
        with self._lock:
            self.last_lsn = 0
            self.memory_records.clear()
            if not self.in_memory and os.path.exists(self.wal_path):
                try:
                    with open(self.wal_path, "w", encoding="utf-8") as f:
                        f.truncate(0)
                except Exception:
                    pass


wal_service = WriteAheadLogService()

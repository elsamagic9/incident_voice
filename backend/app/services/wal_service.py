"""Session-scoped diagnostic event journal with verified, contiguous sequences.

Authoritative browser/incident recovery uses transactional session_store checkpoints.
This journal is not ARIES and must never replay external infrastructure commands.
"""
import hashlib
from copy import deepcopy
from pathlib import Path
from app.core.session import SessionLocal, current_session
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
        records = self.read_records()
        self.last_lsn = records[-1]['lsn'] if records else 0

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
                self.memory_records.append(deepcopy(record))
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
                candidates = deepcopy(self.memory_records)
            elif not os.path.exists(self.wal_path):
                return []
            else:
                try:
                    with open(self.wal_path, 'r', encoding='utf-8') as stream:
                        candidates = [json.loads(line) for line in stream if line.strip()]
                except (ValueError, UnicodeError) as exc:
                    raise RuntimeError('Event journal is truncated or invalid; recovery stopped') from exc
            previous = 0
            for rec in candidates:
                try:
                    expected = self._compute_checksum(rec['lsn'], rec['prev_lsn'], rec['timestamp'], rec['type'], rec['payload'])
                    valid = rec['lsn'] == previous + 1 and rec['prev_lsn'] == previous and rec['checksum'] == expected
                except (KeyError, TypeError, ValueError):
                    valid = False
                if not valid:
                    raise RuntimeError('Event journal checksum or sequence failed; recovery stopped')
                previous = rec['lsn']
            return candidates

    def replay_into_state(self, state, audit_ledger=None, investigation=None) -> Dict[str, Any]:
        """Inspect legacy event records; not complete session or mutation recovery."""
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

        # Identify pending intents only. This function does not execute an undo.
        uncommitted = [m_id for m_id in staged_mutations if m_id not in confirmed_mutations]

        return {
            "recovered_records": len(records),
            "recovered_timeline_events": recovered_events,
            "unconfirmed_staged_mutations": uncommitted,
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


def _session_journal():
    session = current_session.get()
    if session is None:
        raise RuntimeError('An operator session is required for event journaling')
    if settings.wal_storage_dir == ':memory:':
        return WriteAheadLogService(':memory:')
    directory = Path(settings.wal_storage_dir) / 'journals' / hashlib.sha256(session.id.encode()).hexdigest()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    return WriteAheadLogService(str(directory))


wal_service = SessionLocal('wal', _session_journal)

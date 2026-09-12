import json
import os
import shutil
import tempfile
import time
import pytest
from app.core.state import ClusterState
from app.services.audit_ledger import CryptographicAuditLedger
from app.services.wal_service import WriteAheadLogService


@pytest.fixture
def tmp_wal_dir():
    d = tempfile.mkdtemp(prefix="wal_test_")
    yield d
    shutil.rmtree(d, ignore_errors=True)


def test_wal_append_monotonic_lsn_and_checksum(tmp_wal_dir):
    wal = WriteAheadLogService(storage_dir=tmp_wal_dir)
    r1 = wal.append("TIMELINE_EVENT", {"text": "Outage detected", "type": "alert"})
    r2 = wal.append("TIMELINE_EVENT", {"text": "Investigating order-db", "type": "voice"})

    assert r1["lsn"] == 1
    assert r1["prev_lsn"] == 0
    assert r2["lsn"] == 2
    assert r2["prev_lsn"] == 1
    assert len(r1["checksum"]) == 64
    assert len(r2["checksum"]) == 64

    records = wal.read_records()
    assert len(records) == 2
    assert records[0]["payload"]["text"] == "Outage detected"
    assert records[1]["payload"]["text"] == "Investigating order-db"


def test_legacy_event_inspection_identifies_unconfirmed_intents(tmp_wal_dir):
    wal = WriteAheadLogService(storage_dir=tmp_wal_dir)
    audit = CryptographicAuditLedger()

    # Log initial timeline events
    wal.append("TIMELINE_EVENT", {"timestamp": 100.0, "type": "alert", "text": "Payment 503 spike"})
    wal.append("INCIDENT_STATUS", {"status": "MITIGATING"})
    wal.append("MITIGATION_APPLIED", {"action": "restart_pod"})

    # Stage two mutations: one gets confirmed, one stays unconfirmed (simulating crash)
    wal.append("STAGE_MUTATION", {"id": "stage-confirmed", "action": "restart_pod", "service_name": "payment-service"})
    wal.append("CONFIRM_MUTATION", {"id": "stage-confirmed", "action": "restart_pod", "service_name": "payment-service"})
    wal.append("STAGE_MUTATION", {"id": "stage-unconfirmed", "action": "flush_cache", "service_name": "redis-cache"})

    # Record genesis and audit block into WAL
    wal.append("AUDIT_BLOCK", audit.blocks[0])
    b1 = audit.record_event("MUTATION_STAGED", "operator-1", "SRE_COMMANDER", "restart_pod")
    wal.append("AUDIT_BLOCK", b1)

    # Now simulate fresh process crash/startup: create fresh state and replay WAL
    recovered_state = ClusterState()
    recovered_audit = CryptographicAuditLedger()

    res = wal.replay_into_state(recovered_state, recovered_audit)

    assert res["recovered_records"] == 8
    assert res["unconfirmed_staged_mutations"] == ["stage-unconfirmed"]
    assert recovered_state.incident.status == "MITIGATING"
    assert "restart_pod" in recovered_state.incident.mitigations_applied
    assert any(e["text"] == "Payment 503 spike" for e in recovered_state.incident.timeline_events)

    # Verify audit chain integrity on the recovered ledger
    is_valid, count, err = recovered_audit.verify_chain_integrity()
    assert is_valid, f"Audit chain invalid after recovery: {err}"
    assert count >= 2  # genesis + recovered block


def test_wal_corruption_stops_the_sequence(tmp_wal_dir):
    wal = WriteAheadLogService(storage_dir=tmp_wal_dir)
    wal.append("TIMELINE_EVENT", {"text": "Valid record 1", "type": "alert"})

    # Tamper with the WAL file by modifying payload without updating checksum
    with open(wal.wal_path, "a", encoding="utf-8") as f:
        tampered = {
            "lsn": 2,
            "prev_lsn": 1,
            "timestamp": time.time(),
            "type": "TIMELINE_EVENT",
            "payload": {"text": "Forged malicious record"},
            "checksum": "0" * 64,  # invalid checksum
        }
        f.write(json.dumps(tampered) + "\n")

    # Append another valid record
    wal.last_lsn = 2
    wal.append("TIMELINE_EVENT", {"text": "Valid record 3", "type": "voice"})

    # Recovery must not jump over an invalid record and accept later state.
    with pytest.raises(RuntimeError, match='checksum or sequence'):
        wal.read_records()
    with pytest.raises(RuntimeError, match='checksum or sequence'):
        WriteAheadLogService(storage_dir=tmp_wal_dir)

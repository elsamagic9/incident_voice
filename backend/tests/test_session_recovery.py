"""Restart, isolation and failure-boundary tests for real session checkpoints."""
import array
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from unittest.mock import Mock
import pytest
from fastapi.testclient import TestClient
from app.core import session_store as storage
from app.core.session_store import SessionStore
from app.core.session import create_session, current_session, find_session, sessions, SESSION_TTL
from app.core.state import cluster_state
from app.services.blackbox_service import blackbox_service
from app.services.investigation import investigation_service
from app.services.orchestrator import agent_orchestrator
from app.services.audit_ledger import audit_ledger
from main import app


def populate(session, title):
    token = current_session.set(session)
    try:
        cluster_state.incident.title = title
        agent_orchestrator.record_turn('user', title)
        investigation_service.brief = investigation_service.capture()
        blackbox_service.record_audio(array.array('h', [1200, -800] * 240).tobytes(), 24000, 'user')
        blackbox_service.record_audio(array.array('h', [400, -250] * 240).tobytes(), 24000, 'agent')
        _, pending = agent_orchestrator._stage_remediation('restart_pod', 'payment-service', {})
        assert pending['status'] == 'staged'
        storage.checkpoint_session()
        return {'id': session.id, 'title': title, 'brief': investigation_service.brief,
                'wav_hash': hashlib.sha256(blackbox_service.generate_wav()).hexdigest(),
                'audit': list(audit_ledger.blocks), 'staged_id': pending['id']}
    finally:
        current_session.reset(token)


def assert_recovered(session, expected):
    assert session is not None
    token = current_session.set(session)
    try:
        assert cluster_state.incident.title == expected['title']
        assert cluster_state.services['payment-service'].status == 'critical'
        assert investigation_service.brief == expected['brief']
        assert hashlib.sha256(blackbox_service.generate_wav()).hexdigest() == expected['wav_hash']
        assert audit_ledger.blocks[:len(expected['audit'])] == expected['audit']
        assert audit_ledger.verify_chain_integrity()[0]
        assert agent_orchestrator.staged_action is None
        assert not agent_orchestrator.awaiting_confirmation
        assert agent_orchestrator.confirm_staged_remediation(expected['staged_id'])[1] == []
        assert any(event['type'] == 'recovery' for event in cluster_state.incident.timeline_events)
    finally:
        current_session.reset(token)


def test_two_sessions_restore_exact_evidence_audio_and_expired_approvals(tmp_path, monkeypatch):
    path = tmp_path / 'sessions.sqlite3'
    monkeypatch.setattr(storage, 'session_store', SessionStore(path))
    expected = [populate(create_session(), title) for title in ['Private incident A', 'Private incident B']]
    sessions.clear()
    monkeypatch.setattr(storage, 'session_store', SessionStore(path))
    for data in expected:
        assert_recovered(find_session(data['id']), data)


def test_logout_and_ttl_delete_saved_recordings(tmp_path, monkeypatch):
    store = SessionStore(tmp_path / 'sessions.sqlite3')
    monkeypatch.setattr(storage, 'session_store', store)
    session = create_session()
    populate(session, 'retention')
    with TestClient(app) as client:
        client.cookies.set('incident_voice_session', session.id)
        assert client.delete('/api/session').status_code == 200
    sessions.clear()
    assert store.load(session.id) is None
    assert store._db.execute('SELECT COUNT(*) FROM audio').fetchone()[0] == 0
    expired = create_session()
    populate(expired, 'expired')
    expired.created_at = time.time() - SESSION_TTL - 1
    store.delete(expired.id)
    store.save(expired)
    assert store.purge_expired() == 1
    assert store.load(expired.id) is None
    assert store._db.execute('SELECT COUNT(*) FROM audio').fetchone()[0] == 0


def test_failed_checkpoint_stops_infrastructure_and_retains_last_commit(tmp_path, monkeypatch):
    store = SessionStore(tmp_path / 'sessions.sqlite3')
    monkeypatch.setattr(storage, 'session_store', store)
    session = create_session()
    old = populate(session, 'committed title')
    token = current_session.set(session)
    try:
        from app.services import orchestrator
        execute = Mock()
        monkeypatch.setattr(orchestrator, 'execute_remediation', execute)
        monkeypatch.setattr(store, 'save', Mock(side_effect=OSError('Disk full')))
        with pytest.raises(OSError, match='Disk full'):
            agent_orchestrator.confirm_staged_remediation(old['staged_id'])
        execute.assert_not_called()
    finally:
        current_session.reset(token)
    assert_recovered(SessionStore(tmp_path / 'sessions.sqlite3').load(session.id), old)


def test_interrupted_approved_action_is_uncertain_and_never_replayed(tmp_path, monkeypatch):
    path = tmp_path / 'sessions.sqlite3'
    store = SessionStore(path)
    monkeypatch.setattr(storage, 'session_store', store)
    session = create_session()
    populate(session, 'interrupted')
    session.mutation_in_flight = {'id': 'pending-live-operation', 'action': 'restart_pod', 'service_name': 'payment-service'}
    store.save(session)
    sessions.clear()
    from app.services import orchestrator
    execute = Mock(side_effect=AssertionError('Recovery must not repeat an external operation'))
    monkeypatch.setattr(orchestrator, 'execute_remediation', execute)
    restored = SessionStore(path).load(session.id)
    token = current_session.set(restored)
    try:
        assert any('outcome is unknown' in event['text'] for event in cluster_state.incident.timeline_events)
        assert agent_orchestrator.staged_action is None
        assert not agent_orchestrator.autopilot_mode
        execute.assert_not_called()
    finally:
        current_session.reset(token)


def test_snapshot_and_audio_corruption_fail_closed(tmp_path, monkeypatch):
    store = SessionStore(tmp_path / 'sessions.sqlite3')
    monkeypatch.setattr(storage, 'session_store', store)
    first, second = create_session(), create_session()
    populate(first, 'first')
    populate(second, 'second')
    with store._db:
        store._db.execute("UPDATE sessions SET snapshot='{}' WHERE id=?", (first.id,))
        store._db.execute('UPDATE audio SET pcm=? WHERE session_id=?', (b'bad audio', second.id))
    with pytest.raises(RuntimeError, match='checksum'):
        store.load(first.id)
    with pytest.raises(RuntimeError, match='checksum'):
        store.load(second.id)


def test_confirmed_service_change_and_receipt_survive_restart(tmp_path, monkeypatch):
    path = tmp_path / 'sessions.sqlite3'
    store = SessionStore(path)
    monkeypatch.setattr(storage, 'session_store', store)
    session = create_session()
    before = populate(session, 'confirmed')
    token = current_session.set(session)
    try:
        _, events = agent_orchestrator.confirm_staged_remediation(before['staged_id'])
        assert events[0]['result']['success']
        assert cluster_state.services['payment-service'].status == 'healthy'
        receipt = json.loads(json.dumps(investigation_service.receipts))
        assert receipt
    finally:
        current_session.reset(token)
    sessions.clear()
    restored = SessionStore(path).load(session.id)
    token = current_session.set(restored)
    try:
        assert cluster_state.services['payment-service'].status == 'healthy'
        assert investigation_service.receipts == receipt
        assert investigation_service.brief == before['brief']
        assert audit_ledger.verify_chain_integrity()[0]
    finally:
        current_session.reset(token)


def test_audio_insert_failure_rolls_back_snapshot_and_reset_discards_old_audio(tmp_path, monkeypatch):
    import sqlite3
    path = tmp_path / 'sessions.sqlite3'
    store = SessionStore(path)
    monkeypatch.setattr(storage, 'session_store', store)
    session = create_session()
    old = populate(session, 'committed')
    with store._db:
        store._db.execute("CREATE TRIGGER reject_audio BEFORE INSERT ON audio BEGIN SELECT RAISE(ABORT, 'disk failure'); END")
    token = current_session.set(session)
    try:
        cluster_state.incident.title = 'uncommitted'
        blackbox_service.record_audio(b'\x01\x00' * 10, 24000)
        with pytest.raises(sqlite3.IntegrityError, match='disk failure'):
            storage.checkpoint_session()
        assert_recovered(SessionStore(path).load(session.id), old)
        with store._db:
            store._db.execute('DROP TRIGGER reject_audio')
        blackbox_service.reset()
        storage.checkpoint_session()
        assert store._db.execute('SELECT COUNT(*) FROM audio').fetchone()[0] == 0
    finally:
        current_session.reset(token)


def test_actual_process_exit_recovers_browser_cookies(tmp_path):
    env = {**os.environ, 'WAL_STORAGE_DIR': str(tmp_path), 'INFRASTRUCTURE_MODE': 'simulation',
           'OPERATOR_ACCESS_TOKEN': '', 'ASSEMBLYAI_API_KEY': '', 'GEMINI_API_KEY': '',
           'OPENAI_API_KEY': '', 'LLM_PROVIDER': 'mock', 'TTS_PROVIDER': 'browser'}
    backend = Path(__file__).resolve().parents[1]
    code = '''
import json, os, runpy
from app.core.session import create_session
populate = runpy.run_path('tests/test_session_recovery.py')['populate']
first = populate(create_session(), 'process A')
second = populate(create_session(), 'process B')
print(json.dumps([first, second]), flush=True)
# Terminate with an unfinished database transaction after the committed checkpoints.
from app.core.session_store import session_store
session_store._db.execute('BEGIN IMMEDIATE')
session_store._db.execute("UPDATE sessions SET snapshot='partial uncommitted write'")
os._exit(0)
'''
    process = subprocess.Popen([sys.executable, '-c', code], cwd=backend, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out, err = process.communicate(timeout=30)
    assert process.returncode == 0, err
    payload = tmp_path / 'expected.json'
    payload.write_text(json.dumps(json.loads(out)))
    verify = '''
import json, runpy
from fastapi.testclient import TestClient
from app.core.session import find_session
from main import app
check = runpy.run_path('tests/test_session_recovery.py')['assert_recovered']
for data in json.load(open(__import__('sys').argv[1])):
    with TestClient(app) as client:
        client.cookies.set('incident_voice_session', data['id'])
        response = client.get('/api/cluster')
        assert response.status_code == 200, response.text
        assert response.json()['incident']['title'] == data['title']
        check(find_session(data['id']), data)
print('two isolated browser cookies, evidence, audit, audio and expired approvals recovered')
'''
    process = subprocess.Popen([sys.executable, '-c', verify, str(payload)], cwd=backend, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out, err = process.communicate(timeout=30)
    assert process.returncode == 0, err
    assert 'two isolated browser cookies' in out

"""Versioned session checkpoints on local SQLite, with transactional PCM storage.

This is application checkpoint recovery, not an implementation of ARIES. External
operations are never replayed. Run one application worker against a local volume.
"""
import array
import hashlib
import json
from pathlib import Path
import sqlite3
import shutil
import sys
import threading
import time


class SessionStore:
    def __init__(self, path=None):
        if path:
            path = Path(path)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch(mode=0o600, exist_ok=True)
            path.chmod(0o600)
        self.directory = path.parent if path else None
        self._lock = threading.RLock()
        self._db = sqlite3.connect(str(path) if path else ':memory:', check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.execute('PRAGMA foreign_keys=ON')
        self._db.execute('PRAGMA journal_mode=WAL')
        self._db.execute('PRAGMA synchronous=FULL')
        with self._db:
            self._db.execute('''CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, expires_at REAL NOT NULL, snapshot TEXT NOT NULL,
                checksum TEXT NOT NULL)''')
            self._db.execute('''CREATE TABLE IF NOT EXISTS audio (
                session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
                chunk_index INTEGER, generation TEXT NOT NULL, sample_offset INTEGER NOT NULL,
                speaker TEXT NOT NULL, pcm BLOB NOT NULL, checksum TEXT NOT NULL,
                PRIMARY KEY(session_id, chunk_index))''')
        if path:
            path.chmod(0o600)

    def save(self, session):
        from app.core.session import SESSION_TTL
        payload = {
            'version': 1,
            'identity': {key: getattr(session, key) for key in (
                'id', 'operator_id', 'operator', 'role', 'authenticated', 'token_hash', 'created_at', 'last_seen')},
            'infrastructure_mode': session.infrastructure_mode,
            'mutation_in_flight': session.mutation_in_flight,
            'services': {},
        }
        values = payload['services']
        for name, service in list(session.services.items()):
            if name == 'cluster':
                values[name] = {'incident': service.incident.model_dump(),
                                'services': {key: value.model_dump() for key, value in service.services.items()}}
            elif name == 'investigation':
                values[name] = {key: getattr(service, key) for key in ('brief', 'receipts', 'verification')}
            elif name == 'orchestrator':
                values[name] = {key: getattr(service, key) for key in (
                    'history', 'staged_action', 'awaiting_confirmation', 'postmortem_result',
                    'last_reasoning', 'last_provider_error', 'last_llm_ms', 'last_tool_ms')}
            elif name == 'audit':
                values[name] = {'blocks': service.blocks}
            elif name == 'blackbox':
                values[name] = {key: getattr(service, key) for key in (
                    'recording_id', 'started_at', 'events', 'next_event_id', 'track_ends', 'sample_count', 'recording_limited')}
                values[name]['chunk_count'] = len(service.chunks)
            elif name == 'runbook':
                values[name] = {'active_session': service.active_session.model_dump() if service.active_session else None,
                                'pending_action_id': service.pending_action_id}
            elif name == 'reflection':
                stream = service.engine.memory_stream
                values[name] = {'memories': [m.to_dict() for m in stream.memories],
                                'unreflected_importance_sum': stream.unreflected_importance_sum,
                                'critiques': service.engine.reflection_buffer.get_critiques()}
        snapshot = json.dumps(payload, sort_keys=True, allow_nan=False)
        checksum = hashlib.sha256(snapshot.encode()).hexdigest()
        with self._lock, self._db:
            self._db.execute('''INSERT INTO sessions VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot, checksum=excluded.checksum, expires_at=excluded.expires_at''',
                (session.id, session.created_at + SESSION_TTL, snapshot, checksum))
            box = session.services.get('blackbox')
            if box:
                self._db.execute('DELETE FROM audio WHERE session_id=? AND generation!=?', (session.id, box.recording_id))
                saved = self._db.execute('SELECT COUNT(*) FROM audio WHERE session_id=?', (session.id,)).fetchone()[0]
                for index in range(saved, len(box.chunks)):
                    offset, samples, speaker = box.chunks[index]
                    wire = array.array('h', samples)
                    if sys.byteorder != 'little':
                        wire.byteswap()
                    pcm = wire.tobytes()
                    self._db.execute('INSERT INTO audio VALUES (?, ?, ?, ?, ?, ?, ?)',
                        (session.id, index, box.recording_id, offset, speaker, pcm, hashlib.sha256(pcm).hexdigest()))

    def load(self, session_id):
        from app.core.session import OperatorSession, current_session
        from app.core.config import settings
        with self._lock:
            row = self._db.execute('SELECT * FROM sessions WHERE id=?', (session_id,)).fetchone()
            if not row:
                return None
            if row['expires_at'] <= time.time():
                self.delete(session_id)
                return None
            if hashlib.sha256(row['snapshot'].encode()).hexdigest() != row['checksum']:
                raise RuntimeError('Stored incident checksum failed; recovery stopped')
            data = json.loads(row['snapshot'])
            if data.get('version') != 1 or data['identity']['id'] != session_id:
                raise RuntimeError('Unsupported or mismatched incident checkpoint')
            if data['infrastructure_mode'] != settings.infrastructure_mode:
                return None  # A simulation cookie must never restore into live infrastructure.
            audio_rows = self._db.execute('SELECT * FROM audio WHERE session_id=? ORDER BY chunk_index', (session_id,)).fetchall()
        session = OperatorSession(**data['identity'], infrastructure_mode=data['infrastructure_mode'])
        from app.core.auth_rbac import operator_registry
        if not operator_registry.session_is_valid(session):
            self.delete(session_id)
            return None
        token = current_session.set(session)
        try:
            self._restore_services(session, data['services'], audio_rows)
            staged = data['services'].get('orchestrator', {}).get('staged_action')
            interrupted = data.get('mutation_in_flight')
            if staged or interrupted:
                from app.core.state import cluster_state
                message = ('Server restarted during an approved operation. Its outcome is unknown; inspect fresh telemetry before retrying.'
                           if interrupted else 'Server restarted. The previous approval expired; no pending action was replayed.')
                # Store recovery markers in the next checkpoint without replaying old log events.
                cluster_state.incident.timeline_events.append({'timestamp': time.time(), 'type': 'recovery', 'text': message})
                from app.services.audit_ledger import audit_ledger
                audit_ledger.record_event('SESSION_RECOVERED', session.operator_id, session.role,
                                          'APPROVAL_EXPIRED', {'interrupted_action': interrupted, 'message': message})
            return session
        finally:
            current_session.reset(token)

    @staticmethod
    def _restore_services(session, values, audio_rows):
        from app.core.state import ClusterState, ServiceNode, IncidentRecord
        from app.services.investigation import InvestigationService
        from app.services.orchestrator import AgentOrchestrator
        from app.services.audit_ledger import CryptographicAuditLedger
        from app.services.blackbox_service import BlackBoxService
        from app.services.runbook_engine import RunbookEngine, ActiveRunbookSession
        from app.services.reflection_service import ReflexionService, MemoryItem
        factories = {'cluster': ClusterState, 'investigation': InvestigationService,
                     'orchestrator': AgentOrchestrator, 'audit': CryptographicAuditLedger,
                     'blackbox': BlackBoxService, 'runbook': RunbookEngine, 'reflection': ReflexionService}
        for name, value in values.items():
            if name not in factories:
                raise RuntimeError('Unknown stored service; recovery stopped')
            service = factories[name]()
            if name == 'cluster':
                service.incident = IncidentRecord.model_validate(value['incident'])
                service.services = {key: ServiceNode.model_validate(node) for key, node in value['services'].items()}
                if session.infrastructure_mode != 'simulation':
                    for node in service.services.values():
                        node.status = 'unknown'
                        node.metrics_available = False
            elif name == 'runbook':
                service.active_session = ActiveRunbookSession.model_validate(value['active_session']) if value['active_session'] else None
                service.pending_action_id = None
                if service.active_session and value.get('pending_action_id'):
                    service.active_session.status = 'aborted'
            elif name == 'reflection':
                stream = service.engine.memory_stream
                stream.memories = []
                for m in value['memories']:
                    item = MemoryItem(m['id'], m['description'], m['importance'], m['timestamp'], m['metadata'], m['is_reflection'])
                    item.last_accessed = m['last_accessed']
                    stream.memories.append(item)
                stream.unreflected_importance_sum = value['unreflected_importance_sum']
                service.engine.reflection_buffer.buffer.extend(value['critiques'])
            else:
                for key, item in value.items():
                    if key != 'chunk_count':
                        setattr(service, key, item)
            if name == 'orchestrator':
                service.staged_action = None
                service.awaiting_confirmation = False
                service.autopilot_mode = False
            if name == 'audit' and not service.verify_chain_integrity()[0]:
                raise RuntimeError('Stored audit chain failed verification')
            if name == 'blackbox':
                if len(audio_rows) != value['chunk_count']:
                    raise RuntimeError('Stored recording is incomplete')
                for index, row in enumerate(audio_rows):
                    if row['chunk_index'] != index or row['generation'] != service.recording_id or hashlib.sha256(row['pcm']).hexdigest() != row['checksum']:
                        raise RuntimeError('Stored recording checksum failed')
                    samples = array.array('h')
                    samples.frombytes(row['pcm'])
                    if sys.byteorder != 'little':
                        samples.byteswap()
                    service.chunks.append((row['sample_offset'], samples, row['speaker']))
            session.services[name] = service

    def delete(self, session_id):
        with self._lock, self._db:
            self._db.execute('DELETE FROM sessions WHERE id=?', (session_id,))
        if self.directory:
            shutil.rmtree(self.directory / 'journals' / hashlib.sha256(session_id.encode()).hexdigest(), ignore_errors=True)

    def active_count(self):
        with self._lock:
            return self._db.execute('SELECT COUNT(*) FROM sessions WHERE expires_at>?', (time.time(),)).fetchone()[0]

    def purge_expired(self):
        with self._lock:
            expired = self._db.execute('SELECT id FROM sessions WHERE expires_at<=?', (time.time(),)).fetchall()
            for row in expired:
                self.delete(row['id'])
            return len(expired)


from app.core.config import settings
session_store = SessionStore(Path(settings.wal_storage_dir) / 'sessions.sqlite3')


def checkpoint_session():
    from app.core.session import current_session
    session = current_session.get()
    if session is not None:
        session_store.save(session)

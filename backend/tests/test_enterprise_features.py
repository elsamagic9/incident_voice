import time
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from main import app
from app.core.config import settings
from app.core.auth_rbac import security_manager, SRERole
from app.core.session import current_session, OperatorSession
from app.core.state import cluster_state
from app.services.orchestrator import agent_orchestrator
from app.services.audit_ledger import audit_ledger


def test_observer_cannot_stage_mutations():
    security_manager.current_role = SRERole.READ_ONLY_OBSERVER
    assert security_manager.is_action_permitted('query_telemetry')
    result = agent_orchestrator.dispatch_tool('execute_remediation', {'action': 'restart_pod', 'service_name': 'payment-service'})
    assert result['status'] == 'denied'
    assert agent_orchestrator.staged_action is None


@pytest.mark.parametrize('text', ['confirm', 'Yes, confirm', 'authorize', 'approve'])
def test_explicit_voice_approval(text):
    security_manager.generate_phonetic_challenge()
    assert security_manager.verify_vocal_authorization(text)[0]


@pytest.mark.parametrize('text', ['do not confirm', "don’t approve", 'cancel', 'show logs', 'the logs say confirm'])
def test_negations_and_quoted_instructions_do_not_approve(text):
    security_manager.generate_phonetic_challenge()
    assert not security_manager.verify_vocal_authorization(text)[0]


def test_phonetic_challenge_and_expiry():
    code = security_manager.generate_phonetic_challenge()
    assert security_manager.verify_vocal_authorization(code.replace('-', ' '))[0]
    security_manager.challenge_created_at = time.time() - 31
    assert not security_manager.verify_vocal_authorization(code)[0]
    assert security_manager.active_challenge is None


def test_expired_staging_cannot_execute():
    _, staged = agent_orchestrator._stage_remediation('restart_pod', 'payment-service', {})
    agent_orchestrator.staged_action['expires_at'] = time.time() - 1
    assert agent_orchestrator.confirm_staged_remediation(staged['id'])[1] == []
    assert cluster_state.services['payment-service'].status == 'critical'


def test_audit_integrity_and_tampering():
    audit_ledger.record_event('TEST', 'operator', 'SRE_COMMANDER', 'inspect', {'service': 'payment-service'})
    manifest = audit_ledger.export_audit_manifest()
    assert manifest['chain_status'] == 'TAMPER_EVIDENT_VALID'
    assert 'No compliance certification' in manifest['compliance_certification']
    audit_ledger.blocks[1]['action'] = 'tampered'
    manifest = audit_ledger.export_audit_manifest()
    assert manifest['chain_status'] == 'TAMPERING_DETECTED'
    assert manifest['failure_details']


def test_browser_sessions_isolate_state():
    cluster_state.simulate_scenario('heal_all')
    token = current_session.set(OperatorSession())
    try:
        assert cluster_state.incident.status == 'INVESTIGATING'
        assert agent_orchestrator.history == []
    finally:
        current_session.reset(token)
    assert cluster_state.incident.status == 'RESOLVED'


def test_token_login_and_origin_protection(monkeypatch):
    monkeypatch.setattr(settings, 'operator_access_token', 'test-token')
    with TestClient(app) as client:
        assert client.get('/api/cluster').status_code == 401
        assert client.post('/api/session', json={}).status_code == 401
        assert client.post('/api/session', json={'access_token': 'test-token'}, headers={'origin': 'https://untrusted.example'}).status_code == 403
        assert client.post('/api/session', json={'access_token': 'test-token'}).status_code == 200
        assert client.get('/api/cluster').status_code == 200
        assert client.get('/api/security/status').json()['hardware_mfa'] is False
        assert client.delete('/api/session').status_code == 200
        assert client.get('/api/cluster').status_code == 401


def test_live_mode_requires_token_configuration(monkeypatch):
    monkeypatch.setattr(settings, 'infrastructure_mode', 'docker')
    with TestClient(app) as client:
        assert client.post('/api/session', json={}).status_code == 503


def test_websocket_rejects_untrusted_origin(client):
    with pytest.raises(WebSocketDisconnect) as error:
        with client.websocket_connect('/ws/agent', headers={'origin': 'https://untrusted.example'}):
            pass
    assert error.value.code == 4401


def test_auto_approval_is_simulation_only(monkeypatch):
    agent_orchestrator.set_autopilot(True)
    _, result = agent_orchestrator._stage_remediation('restart_pod', 'payment-service', {})
    assert result['success'] and result['simulated']
    assert agent_orchestrator.staged_action is None
    agent_orchestrator.set_autopilot(False)
    monkeypatch.setattr(settings, 'infrastructure_mode', 'docker')
    agent_orchestrator.set_autopilot(True)
    assert agent_orchestrator.autopilot_mode is False


def test_benchmark_results_artifact_validity():
    import json
    from pathlib import Path
    data_path = Path(__file__).resolve().parents[1] / "data" / "benchmark_results.json"
    assert data_path.exists(), "Benchmark results file must exist"
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert data["total_turns"] >= 40
    assert data["overall_accuracy_pct"] >= 90.0
    assert data["safety_compliance_pct"] == 100.0
    assert data["audit_ledger"]["valid"] is True
    assert len(data["scenarios"]) == 6


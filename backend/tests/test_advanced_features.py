import array
import io
import wave
import pytest
from app.core.state import cluster_state
from app.services.orchestrator import agent_orchestrator
from app.services.runbook_engine import runbook_engine, evaluate_telemetry_gate, RunbookStep
from app.services.blackbox_service import blackbox_service
from app.core.topology import get_service_topology


def test_starved_database_runbook_can_reach_remediation():
    cluster_state.simulate_scenario('starve_db')
    runbook_engine.start_runbook('runbook-pg-pool')
    _, state, _ = runbook_engine.advance_runbook()
    assert state['current_step_index'] == 1
    assert state['steps'][0]['status'] == 'completed'
    for _ in range(3):
        _, state, tools = runbook_engine.advance_runbook()
        assert tools[0]['result']['status'] == 'staged'
        action_id = agent_orchestrator.staged_action['id']
        agent_orchestrator.confirm_staged_remediation(action_id)
    _, state, _ = runbook_engine.advance_runbook()
    assert state['status'] == 'completed'
    assert all(step['status'] == 'completed' for step in state['steps'])
    # Runbook success is not a blanket claim that every service recovered.
    assert cluster_state.services['order-db'].status == 'critical'


def test_failed_verification_does_not_advance_runbook():
    runbook_engine.start_runbook('runbook-ingress-surge')
    runbook_engine.advance_runbook()
    runbook_engine.advance_runbook()
    agent_orchestrator.confirm_staged_remediation(agent_orchestrator.staged_action['id'])
    _, state, _ = runbook_engine.advance_runbook()
    assert state['status'] == 'active'
    assert state['current_step_index'] == 2
    assert state['steps'][2]['status'] == 'failed'


def test_abort_runbook_cancels_its_pending_mutation():
    runbook_engine.start_runbook('runbook-redis-eviction')
    runbook_engine.advance_runbook()
    runbook_engine.advance_runbook()
    assert agent_orchestrator.staged_action
    runbook_engine.abort_runbook()
    assert agent_orchestrator.staged_action is None
    assert runbook_engine.active_session.status == 'aborted'
    assert cluster_state.services['redis-cache'].status == 'degraded'


def test_telemetry_gate_rejects_unknown_measurements():
    step = RunbookStep(step_number=1, title='Latency', description='Check latency', command_hint='metrics', target_service='order-db', verification_metric='latency_p99_ms <= 1500')
    assert evaluate_telemetry_gate(step)[0]
    cluster_state.services['order-db'].metrics_available = False
    assert not evaluate_telemetry_gate(step)[0]


@pytest.mark.parametrize('scenario,target', [('crash_payment', 'payment-service'), ('starve_db', 'order-db'), ('traffic_spike', 'ingress-gateway')])
def test_fault_after_recovery_reopens_incident(scenario, target):
    cluster_state.simulate_scenario('heal_all')
    assert cluster_state.incident.resolved_at is not None
    cluster_state.simulate_scenario(scenario)
    assert cluster_state.incident.status == 'INVESTIGATING'
    assert cluster_state.incident.resolved_at is None
    assert cluster_state.services[target].status != 'healthy'


def test_topology_tracks_scenario_changes():
    assert 'payment-service' in get_service_topology()['blast_radius_service_ids']
    cluster_state.simulate_scenario('heal_all')
    assert not get_service_topology()['cascading_failure_active']
    cluster_state.simulate_scenario('traffic_spike')
    assert 'ingress-gateway' in get_service_topology()['blast_radius_service_ids']


def test_text_only_session_has_no_fake_audio(client):
    agent_orchestrator.record_turn('user', 'Inspect payment-service')
    data = client.get('/api/incident/blackbox').json()
    assert data['audio_url'] is None
    assert data['total_duration_seconds'] == 0
    assert len(data['markers']) == 1
    assert client.get('/api/incident/blackbox/audio.wav').status_code == 404


def test_recorded_pcm_exports_playable_wav(client, monkeypatch):
    started = blackbox_service.started_at
    monkeypatch.setattr('app.services.blackbox_service.time.time', lambda: started)
    pcm = array.array('h', [1000] * 1600).tobytes()
    blackbox_service.record_audio(pcm, 16000)
    response = client.get('/api/incident/blackbox/audio.wav')
    assert response.status_code == 200
    with wave.open(io.BytesIO(response.content), 'rb') as recording:
        assert recording.getframerate() == 24000
        assert recording.getnchannels() == 1
        assert recording.getnframes() == 2400
    assert client.get('/api/incident/blackbox').json()['recorded_tracks'] == ['user']


def test_runbook_rest_and_reset(client):
    assert len(client.get('/api/runbooks').json()['runbooks']) == 3
    assert client.post('/api/runbooks/start', json={'runbook_id': 'runbook-redis-eviction'}).json()['session']['status'] == 'active'
    assert client.post('/api/runbooks/advance').json()['session']['current_step_index'] == 1
    agent_orchestrator.record_turn('user', 'Test turn')
    client.post('/api/incident/reset')
    assert runbook_engine.active_session is None
    assert blackbox_service.events == []
    assert agent_orchestrator.history == []

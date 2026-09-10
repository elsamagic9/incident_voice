import pytest
from starlette.websockets import WebSocketDisconnect
from app.core.state import cluster_state


def test_session_staging_approval_and_report(client, ws_command):
    with client.websocket_connect('/ws/agent') as ws:
        events = ws_command(ws, 'text_command', text='Restart payment-service')
        staged = next(e['staged_action'] for e in events if e['type'] == 'staging_sync' and e['staged_action'])
        assert cluster_state.services['payment-service'].status == 'critical'
        events = ws_command(ws, 'authorize_remediation', action_id=staged['id'])
        assert any(e.get('result', {}).get('success') for e in events if e['type'] == 'tool_executed')
        assert cluster_state.services['payment-service'].status == 'healthy'
        events = ws_command(ws, 'text_command', text='Generate postmortem')
        report = next(e['data'] for e in events if e['type'] == 'postmortem_ready')
        assert report['source'] == 'local_events'
        assert report['action_items_tickets'] == []


@pytest.mark.parametrize('engine', ['custom_stt_v3', 'voice_agent_api'])
def test_engine_switching_and_unconfigured_voice(client, ws_command, engine):
    with client.websocket_connect('/ws/agent') as ws:
        events = ws_command(ws, 'select_engine', engine=engine)
        assert any(e['type'] == 'engine_sync' and e['engine'] == engine for e in events)
        events = ws_command(ws, 'start_voice')
        assert any(e['type'] == 'provider_status' and e['state'] == 'unconfigured' for e in events)
        assert not any(e['type'] == 'voice_ready' for e in events)


@pytest.mark.parametrize('kind,args', [('toggle_autopilot', {'enabled': True}), ('simulate_scenario', {'scenario': 'heal_all'})])
def test_control_responses_reset_audio_suppression(client, ws_command, kind, args):
    with client.websocket_connect('/ws/agent') as ws:
        events = ws_command(ws, kind, **args)
        interrupt = next(e for e in events if e['type'] == 'interrupt')
        audio = next((e for e in events if e['type'] == 'audio_stream'), None)
        while audio is None:
            event = ws.receive_json()
            if event['type'] == 'audio_stream': audio = event
        assert audio['epoch'] == interrupt['epoch']
        assert audio['encoding'] == 'browser'


def test_scenario_commands_and_reset(client, ws_command):
    with client.websocket_connect('/ws/agent') as ws:
        ws_command(ws, 'simulate_scenario', scenario='heal_all')
        events = ws_command(ws, 'simulate_scenario', scenario='traffic_spike')
        sync = next(e for e in events if e['type'] == 'cluster_sync')
        assert sync['incident']['status'] == 'INVESTIGATING'
        assert sync['services']['ingress-gateway']['status'] == 'degraded'
        events = ws_command(ws, 'reset_incident')
        assert any(e['type'] == 'session_reset' for e in events)


def test_runbook_control_syncs_active_session(client, ws_command):
    with client.websocket_connect('/ws/agent') as ws:
        ws_command(ws, 'simulate_scenario', scenario='starve_db')
        ws_command(ws, 'start_runbook', runbook_id='runbook-pg-pool')
        events = ws_command(ws, 'advance_runbook')
        sync = next(e for e in events if e['type'] == 'cluster_sync')
        assert sync['active_runbook']['current_step_index'] == 1


def test_second_tab_rejected_and_disconnect_cancels_pending(client, ws_command):
    from app.services.orchestrator import agent_orchestrator
    with client.websocket_connect('/ws/agent') as ws:
        ws_command(ws, 'text_command', text='Restart payment-service')
        with pytest.raises(WebSocketDisconnect) as error:
            with client.websocket_connect('/ws/agent'):
                pass
        assert error.value.code == 4409
    assert agent_orchestrator.staged_action is None

import pytest
import json
from fastapi.testclient import TestClient
from main import app
from app.core.state import cluster_state

def setup_function():
    cluster_state.reset_to_default_incident()

def read_until_turn_ends(websocket, max_messages=100):
    messages = []
    for _ in range(max_messages):
        try:
            data = json.loads(websocket.receive_text())
            messages.append(data)
            if data.get("type") == "agent_state" and data.get("state") == "listening":
                break
        except Exception:
            break
    return messages

def test_websocket_e2e_flow():
    client = TestClient(app)
    with client.websocket_connect("/ws/agent") as websocket:
        # 1. Initial messages should contain cluster_sync
        initial_msgs = []
        for _ in range(3):
            data = json.loads(websocket.receive_text())
            initial_msgs.append(data)
            if data.get("type") == "cluster_sync":
                break

        types = [m.get("type") for m in initial_msgs]
        assert "cluster_sync" in types
        sync_msg = next(m for m in initial_msgs if m.get("type") == "cluster_sync")
        assert sync_msg["incident"]["id"] == "INC-8942"
        assert "payment-service" in sync_msg["services"]

        # 2. Send text command: "What alerts are firing right now?"
        websocket.send_text(json.dumps({
            "type": "text_command",
            "text": "What alerts are firing right now?"
        }))

        turn1_msgs = read_until_turn_ends(websocket)
        turn1_types = [m.get("type") for m in turn1_msgs]
        assert "turn" in turn1_types
        assert "tool_executed" in turn1_types
        assert "cluster_sync" in turn1_types
        assert any(m.get("tool_name") == "get_cluster_health" for m in turn1_msgs if m.get("type") == "tool_executed")

        # 3. Send text command: "Scale payment-service to 5 replicas"
        websocket.send_text(json.dumps({
            "type": "text_command",
            "text": "Scale payment-service to 5 replicas"
        }))

        turn2_msgs = read_until_turn_ends(websocket)
        executed_tools = [m.get("tool_name") for m in turn2_msgs if m.get("type") == "tool_executed"]
        assert "execute_remediation" in executed_tools
        assert cluster_state.services["payment-service"].replicas == 5

        # 4. Send text command: "Wrap up incident and generate post-mortem"
        websocket.send_text(json.dumps({
            "type": "text_command",
            "text": "Wrap up incident and generate post-mortem"
        }))

        turn3_msgs = read_until_turn_ends(websocket)
        pm_msg = next((m for m in turn3_msgs if m.get("type") == "postmortem_ready"), None)
        assert pm_msg is not None
        assert "incident_id" in pm_msg["data"]
        assert "preventive_action_items" in pm_msg["data"]
        assert len(pm_msg["data"]["preventive_action_items"]) > 0

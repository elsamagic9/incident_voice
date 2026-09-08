import pytest
import json
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from main import app
from app.core.state import cluster_state
from app.services.orchestrator import agent_orchestrator
from app.services.lemur_service import lemur_service
from app.services.assemblyai_voice_agent import AssemblyAIVoiceAgentSession
from app.tools.tool_schemas import SRE_TOOL_DEFINITIONS

def setup_function():
    cluster_state.reset_to_default_incident()
    agent_orchestrator.reset()

def read_until_turn_ends(websocket, max_messages=100):
    messages = []
    for _ in range(max_messages):
        try:
            data = json.loads(websocket.receive_text())
            messages.append(data)
            if data.get("type") == "agent_state" and data.get("state") in ["listening", "awaiting_confirmation"]:
                break
        except Exception:
            break
    return messages

# =============================================================================
# Feature 1: Dual-Engine Architecture
# =============================================================================
def test_dual_engine_websocket_negotiation():
    """Verify that websocket accepts both engine modes and emits engine_sync."""
    client = TestClient(app)

    # 1. Connect with Path 2 (custom_stt_v3)
    with client.websocket_connect("/ws/agent?engine=custom_stt_v3") as ws2:
        sync_msg = None
        for _ in range(3):
            msg = json.loads(ws2.receive_text())
            if msg.get("type") == "engine_sync":
                sync_msg = msg
                break
        assert sync_msg is not None
        assert sync_msg["engine"] == "custom_stt_v3"
        assert "voice_agent_api" in sync_msg["supported_engines"]

    # 2. Connect with Path 1 (voice_agent_api)
    with client.websocket_connect("/ws/agent?engine=voice_agent_api") as ws1:
        sync_msg = None
        for _ in range(3):
            msg = json.loads(ws1.receive_text())
            if msg.get("type") == "engine_sync":
                sync_msg = msg
                break
        assert sync_msg is not None
        assert sync_msg["engine"] == "voice_agent_api"

    # 3. Dynamic engine switching via select_engine message
    with client.websocket_connect("/ws/agent?engine=custom_stt_v3") as ws:
        # Drain all initial messages until engine_sync
        for _ in range(5):
            msg = json.loads(ws.receive_text())
            if msg.get("type") == "engine_sync":
                break

        # Send select_engine to switch to voice_agent_api
        ws.send_text(json.dumps({"type": "select_engine", "engine": "voice_agent_api"}))
        switch_msg = None
        for _ in range(5):
            msg = json.loads(ws.receive_text())
            if msg.get("type") == "engine_sync":
                switch_msg = msg
                break
        assert switch_msg is not None
        assert switch_msg["engine"] == "voice_agent_api"

def test_assemblyai_voice_agent_session_structure():
    """Verify Voice Agent API session setup, session.update, and tool formatting."""
    session = AssemblyAIVoiceAgentSession(api_key="test-api-key")
    assert session.ws_url == "wss://agents.assemblyai.com/v1/ws"
    assert session.awaiting_confirmation is False
    assert session.staged_action is None

    # Test staging guardrail within voice agent session
    tool_call_event = {
        "type": "tool.call",
        "call_id": "call_123",
        "name": "execute_remediation",
        "arguments": {"action": "restart_pod", "service_name": "payment-service"}
    }

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(session._handle_tool_call(tool_call_event))
        assert session.awaiting_confirmation is True
        assert session.staged_action["action"] == "restart_pod"
        assert session.staged_action["service_name"] == "payment-service"

        # Confirm staged remediation
        res = session.confirm_staged_remediation()
        assert res is not None
        assert res["tool_name"] == "execute_remediation"
        assert session.awaiting_confirmation is False
        assert session.staged_action is None
    finally:
        loop.close()

# =============================================================================
# Feature 2 & 3: Two-Phase SRE Safety Guardrail & Dynamic Orchestrator
# =============================================================================
@pytest.mark.asyncio
async def test_two_phase_safety_guardrail_staging_and_confirmation():
    """Destructive action is staged, asks for confirmation, then executes upon confirm."""
    agent_orchestrator.reset()
    assert cluster_state.services["payment-service"].status == "critical"

    # Step 1: Request destructive rolling restart
    prompt, tools, _ = await agent_orchestrator.process_user_turn("Please restart payment-service pods")
    assert "Remediation staged: Rolling restart of payment-service" in prompt
    assert "Hardware MFA required" in prompt
    assert agent_orchestrator.awaiting_confirmation is True
    assert agent_orchestrator.staged_action is not None
    # Crucial: Service must NOT be healed yet!
    assert cluster_state.services["payment-service"].status == "critical"

    # Step 2: Vocal confirmation "Confirm"
    confirm_text, executed_tools, _ = await agent_orchestrator.process_user_turn("Confirm")
    assert "Confirmed" in confirm_text
    assert "Graceful rolling restart executed for payment-service" in confirm_text
    assert agent_orchestrator.awaiting_confirmation is False
    assert agent_orchestrator.staged_action is None
    # Service is now healed!
    assert cluster_state.services["payment-service"].status == "healthy"
    assert len(executed_tools) == 1
    assert executed_tools[0]["tool_name"] == "execute_remediation"

@pytest.mark.asyncio
async def test_two_phase_safety_guardrail_cancellation():
    """Destructive action can be aborted without applying changes."""
    agent_orchestrator.reset()

    # Step 1: Request cache flush (destructive)
    prompt, _, _ = await agent_orchestrator.process_user_turn("Flush the redis cache")
    assert "Remediation staged: Cache flush of redis-cache" in prompt
    assert agent_orchestrator.awaiting_confirmation is True

    # Step 2: Cancel
    cancel_text, tools, _ = await agent_orchestrator.process_user_turn("Cancel")
    assert "Remediation cancelled" in cancel_text
    assert agent_orchestrator.awaiting_confirmation is False
    assert agent_orchestrator.staged_action is None
    assert len(tools) == 0

@pytest.mark.asyncio
async def test_non_destructive_actions_execute_immediately():
    """Non-destructive actions like scaling and logs execute immediately without staging."""
    agent_orchestrator.reset()

    # Scale replicas (non-destructive)
    spoken_text, tools, _ = await agent_orchestrator.process_user_turn("Scale payment-service to 6 replicas")
    assert agent_orchestrator.awaiting_confirmation is False
    assert "Scaled payment-service to 5 replicas" in spoken_text or "Scaled payment-service" in spoken_text
    assert any(t["tool_name"] == "execute_remediation" for t in tools)

    # Inspect logs
    spoken_text, log_tools, _ = await agent_orchestrator.process_user_turn("Show logs for payment-service")
    assert agent_orchestrator.awaiting_confirmation is False
    assert any(t["tool_name"] == "inspect_service_logs" for t in log_tools)

def test_websocket_e2e_two_phase_guardrail_flow():
    """E2E WebSocket flow verifying staging -> UI authorize message -> execution."""
    client = TestClient(app)
    with client.websocket_connect("/ws/agent?engine=custom_stt_v3") as ws:
        # Drain initial sync until engine_sync
        for _ in range(5):
            msg = json.loads(ws.receive_text())
            if msg.get("type") == "engine_sync":
                break

        # 1. Send destructive restart command
        ws.send_text(json.dumps({
            "type": "text_command",
            "text": "Restart the payment-service"
        }))

        msgs = read_until_turn_ends(ws)
        staged_msg = next((m for m in msgs if m.get("type") == "remediation_staged"), None)
        assert staged_msg is not None
        assert staged_msg["staged_action"]["action"] == "restart_pod"
        assert cluster_state.services["payment-service"].status == "critical"

        # 2. Authorize via UI button message
        ws.send_text(json.dumps({
            "type": "authorize_remediation"
        }))

        auth_msgs = read_until_turn_ends(ws)
        executed_tool = next((m for m in auth_msgs if m.get("type") == "tool_executed"), None)
        assert executed_tool is not None
        assert executed_tool["tool_name"] == "execute_remediation"
        assert cluster_state.services["payment-service"].status == "healthy"

# =============================================================================
# Feature 4: Multi-Artifact LeMUR Post-Mortem Synthesis
# =============================================================================
@pytest.mark.asyncio
async def test_lemur_multi_artifact_synthesis():
    """Verify that LeMUR synthesis generates all 3 distinct production artifacts."""
    res = await lemur_service.generate_postmortem(
        transcript_history=[
            {"speaker": "user", "transcript": "What alerts are firing?"},
            {"speaker": "agent", "transcript": "Payment service is failing with DB pool timeout."},
            {"speaker": "user", "transcript": "Scale replicas and restart payment service."},
            {"speaker": "agent", "transcript": "Remediation executed. All pods healthy."}
        ],
        timeline_events=[
            {"timestamp": 1725700000, "type": "alert", "text": "HighErrorRate on payment-gateway"},
            {"timestamp": 1725700100, "type": "action", "text": "Scaled payment-service to 5 replicas"}
        ],
        incident_id="INC-8942"
    )

    # Artifact (a): Formal Markdown Post-Incident Review (PIR)
    assert "markdown_report" in res
    assert "# 📑 Post-Incident Review (PIR): INC-8942" in res["markdown_report"]
    assert "Root Cause Analysis (RCA)" in res["markdown_report"]
    assert "Chronological Timeline" in res["markdown_report"]

    # Artifact (b): Jira / Linear Action Item Tickets JSON
    assert "action_items_tickets" in res
    tickets = res["action_items_tickets"]
    assert isinstance(tickets, list)
    assert len(tickets) >= 4
    for ticket in tickets:
        assert "id" in ticket
        assert "title" in ticket
        assert "priority" in ticket
        assert ticket["priority"] in ["P0", "P1"]
        assert "owner_team" in ticket
        assert "description" in ticket

    # Verify P0 tickets exist
    p0_tickets = [t for t in tickets if t["priority"] == "P0"]
    assert len(p0_tickets) >= 2

    # Artifact (c): Slack Sev-1 Outage Resolution 3-bullet briefing
    assert "slack_briefing" in res
    briefing = res["slack_briefing"]
    assert "🚨 *Sev-1 Outage Resolved:" in briefing
    assert "• *Impact & Root Cause:*" in briefing
    assert "• *Mitigation Applied:*" in briefing
    assert "• *Follow-up & Preventative Action:*" in briefing

def test_voice_agent_api_two_phase_guardrail_flow():
    """E2E WebSocket flow verifying Path 1 staging -> UI authorize -> tool_executed and healing."""
    client = TestClient(app)
    with client.websocket_connect("/ws/agent?engine=voice_agent_api") as ws:
        # Drain initial messages
        for _ in range(5):
            msg = json.loads(ws.receive_text())
            if msg.get("type") == "engine_sync":
                break

        # 1. Send destructive restart command
        ws.send_text(json.dumps({
            "type": "text_command",
            "text": "Restart the payment-service"
        }))

        msgs = read_until_turn_ends(ws)
        staged_msg = next((m for m in msgs if m.get("type") == "remediation_staged"), None)
        assert staged_msg is not None
        assert staged_msg["staged_action"]["action"] == "restart_pod"
        assert cluster_state.services["payment-service"].status == "critical"

        # 2. Authorize via UI button message
        ws.send_text(json.dumps({
            "type": "authorize_remediation"
        }))

        auth_msgs = read_until_turn_ends(ws)
        executed_tool = next((m for m in auth_msgs if m.get("type") == "tool_executed"), None)
        assert executed_tool is not None
        assert executed_tool["tool_name"] == "execute_remediation"
        assert cluster_state.services["payment-service"].status == "healthy"

def test_voice_agent_api_cancellation_flow():
    """E2E WebSocket flow verifying Path 1 staging -> UI cancel clears state."""
    client = TestClient(app)
    with client.websocket_connect("/ws/agent?engine=voice_agent_api") as ws:
        for _ in range(5):
            msg = json.loads(ws.receive_text())
            if msg.get("type") == "engine_sync":
                break

        ws.send_text(json.dumps({
            "type": "text_command",
            "text": "Flush the redis cache"
        }))

        msgs = read_until_turn_ends(ws)
        staged_msg = next((m for m in msgs if m.get("type") == "remediation_staged"), None)
        assert staged_msg is not None

        ws.send_text(json.dumps({
            "type": "cancel_remediation"
        }))

        cancel_msgs = read_until_turn_ends(ws)
        agent_turn = next((m for m in cancel_msgs if m.get("type") == "turn" and m.get("speaker") == "agent"), None)
        assert agent_turn is not None
        assert "cancelled" in agent_turn["transcript"].lower()

@pytest.mark.asyncio
async def test_dynamic_replica_count_extraction():
    """Verify that dynamic argument extraction extracts the exact replica count specified by user."""
    agent_orchestrator.reset()
    spoken_text, tools, _ = await agent_orchestrator.process_user_turn("Please scale payment-service to 8 replicas")
    assert "Scaled payment-service to 8 replicas" in spoken_text
    assert cluster_state.services["payment-service"].replicas == 8
    assert any(t["arguments"].get("count") == 8 for t in tools)

def test_voice_agent_api_postmortem_synthesis():
    """Verify postmortem synthesis trigger in Path 1."""
    client = TestClient(app)
    with client.websocket_connect("/ws/agent?engine=voice_agent_api") as ws:
        for _ in range(5):
            msg = json.loads(ws.receive_text())
            if msg.get("type") == "engine_sync":
                break

        ws.send_text(json.dumps({
            "type": "text_command",
            "text": "Wrap up incident and generate post-mortem"
        }))

        msgs = read_until_turn_ends(ws)
        pm_msg = next((m for m in msgs if m.get("type") == "postmortem_ready"), None)
        assert pm_msg is not None
        assert pm_msg["data"]["incident_id"] == "INC-8942"
        assert "markdown_report" in pm_msg["data"]
        assert "action_items_tickets" in pm_msg["data"]
        assert "slack_briefing" in pm_msg["data"]

@pytest.mark.asyncio
async def test_lemur_json_parsing_with_markdown_fences():
    """Verify robust JSON extraction from LLM response containing markdown fences and preamble."""
    mock_response = """Here is the executive post-mortem review:
```json
{
  "incident_id": "INC-8942",
  "title": "Custom Post-Mortem",
  "severity": "SEV-1",
  "mttd_minutes": 3.5,
  "mttr_minutes": 8.0,
  "executive_summary": "Recovered quickly via voice automation.",
  "root_cause": "High lock contention on orders table.",
  "timeline": [],
  "actions_taken": ["Pod restart"],
  "preventive_action_items": [{"action": "Add index", "owner_team": "Backend Core", "priority": "P0"}],
  "markdown_report": "# PIR INC-8942",
  "action_items_tickets": [{"id": "JIRA-01", "title": "Add index", "priority": "P0", "owner_team": "Core", "description": "Fix locks"}],
  "slack_briefing": "🚨 *Sev-1 Outage Resolved: Custom*"
}
```
"""
    with patch.object(lemur_service, "api_key", "test-api-key"), patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"response": mock_response}
        )
        res = await lemur_service.generate_postmortem(
            transcript_history=[{"speaker": "user", "transcript": "postmortem"}],
            timeline_events=[]
        )
        assert res["title"] == "Custom Post-Mortem"
        assert res["mttd_minutes"] == 3.5
        assert len(res["action_items_tickets"]) == 1

def test_sre_chaos_scenarios():
    """Verify simulation of chaos scenarios in cluster state."""
    cluster_state.reset_to_default_incident()

    # Heal all
    res = cluster_state.simulate_scenario("heal_all")
    assert res["status"] == "restored"
    assert cluster_state.incident.status == "RESOLVED"
    assert all(s.status == "healthy" for s in cluster_state.services.values())

    # Crash payment
    res = cluster_state.simulate_scenario("crash_payment")
    assert res["status"] == "injected"
    assert cluster_state.services["payment-service"].status == "critical"
    assert cluster_state.incident.status == "INVESTIGATING"

    # Starve DB
    res = cluster_state.simulate_scenario("starve_db")
    assert res["status"] == "injected"
    assert cluster_state.services["order-db"].status == "critical"

    # Traffic spike
    res = cluster_state.simulate_scenario("traffic_spike")
    assert res["status"] == "injected"
    assert cluster_state.services["ingress-gateway"].status == "degraded"


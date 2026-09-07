import pytest
import json
import io
import wave
from fastapi.testclient import TestClient
from main import app
from app.core.state import cluster_state
from app.services.orchestrator import agent_orchestrator
from app.services.runbook_engine import runbook_engine
from app.core.topology import get_service_topology
from app.services.blackbox_service import blackbox_service

def setup_function():
    cluster_state.reset_to_default_incident()
    agent_orchestrator.reset()
    runbook_engine.reset()
    blackbox_service.reset()

# =============================================================================
# Feature 1: SRE Runbook Workflow Engine Tests
# =============================================================================
def test_runbook_engine_catalog_and_selection():
    """Verify built-in runbooks are registered with valid step sequences."""
    runbooks = runbook_engine.list_runbooks()
    assert len(runbooks) >= 3
    ids = [rb["id"] for rb in runbooks]
    assert "runbook-pg-pool" in ids
    assert "runbook-redis-eviction" in ids
    assert "runbook-ingress-surge" in ids

    # Check postgres pool runbook structure
    pg_rb = next(rb for rb in runbooks if rb["id"] == "runbook-pg-pool")
    assert len(pg_rb["steps"]) == 5
    assert pg_rb["steps"][0]["step_number"] == 1
    assert "Diagnose" in pg_rb["steps"][0]["title"]
    assert pg_rb["steps"][3]["action"] == "restart_pod"

def test_runbook_workflow_lifecycle():
    """Test start -> advance through steps -> completion."""
    # 1. Start runbook
    spoken, session = runbook_engine.start_runbook("runbook-pg-pool")
    assert "PostgreSQL Connection Pool Starvation" in spoken
    assert session["status"] == "active"
    assert session["current_step_index"] == 0
    assert session["steps"][0]["status"] == "in_progress"

    # 2. Advance step 1 -> step 2
    spoken2, session2, tools2 = runbook_engine.advance_runbook()
    assert "Step 1 complete" in spoken2
    assert session2["current_step_index"] == 1
    assert session2["steps"][0]["status"] == "completed"
    assert session2["steps"][1]["status"] == "in_progress"
    assert len(tools2) >= 1

    # 3. Advance through remaining steps
    for _ in range(3):
        runbook_engine.advance_runbook()

    # Step 5 (final step)
    final_spoken, final_session, _ = runbook_engine.advance_runbook()
    assert "Runbook complete" in final_spoken
    assert final_session["status"] == "completed"
    assert final_session["completed_at"] is not None
    assert all(s["status"] == "completed" for s in final_session["steps"])

def test_runbook_abort_workflow():
    """Test aborting an active runbook cleanly."""
    runbook_engine.start_runbook("runbook-redis-eviction")
    assert runbook_engine.active_session is not None

    spoken, data = runbook_engine.abort_runbook()
    assert "aborted at step 1" in spoken
    assert data["status"] == "aborted"
    assert runbook_engine.active_session is None

@pytest.mark.asyncio
async def test_runbook_voice_intent_in_orchestrator():
    """Test natural language voice commands to control runbooks."""
    # List runbooks
    spoken, tools, _ = await agent_orchestrator.process_user_turn("List available runbooks")
    assert "Available SRE Runbooks" in spoken
    assert any(t["tool_name"] == "list_runbooks" for t in tools)

    # Start runbook
    spoken2, tools2, _ = await agent_orchestrator.process_user_turn("Start runbook postgres connection pool")
    assert "Starting SRE Runbook" in spoken2
    assert any(t["tool_name"] == "start_runbook" for t in tools2)
    assert runbook_engine.active_session is not None

    # Advance runbook
    spoken3, tools3, _ = await agent_orchestrator.process_user_turn("Next step")
    assert "Step 1 complete" in spoken3
    assert any(t["tool_name"] == "advance_runbook" for t in tools3)

def test_runbook_rest_api_endpoints():
    """Verify REST API endpoints for runbooks."""
    client = TestClient(app)

    # GET /api/runbooks
    res = client.get("/api/runbooks")
    assert res.status_code == 200
    assert len(res.json()["runbooks"]) >= 3

    # POST /api/runbooks/start
    start_res = client.post("/api/runbooks/start", json={"runbook_id": "runbook-redis-eviction"})
    assert start_res.status_code == 200
    assert start_res.json()["session"]["status"] == "active"

    # GET /api/runbooks/active
    active_res = client.get("/api/runbooks/active")
    assert active_res.status_code == 200
    assert active_res.json()["session"]["runbook_id"] == "runbook-redis-eviction"

    # POST /api/runbooks/advance
    adv_res = client.post("/api/runbooks/advance")
    assert adv_res.status_code == 200
    assert adv_res.json()["session"]["current_step_index"] == 1

    # POST /api/runbooks/abort
    abort_res = client.post("/api/runbooks/abort")
    assert abort_res.status_code == 200
    assert abort_res.json()["session"]["status"] == "aborted"

# =============================================================================
# Feature 2: Service Dependency Topology Graph & Blast Radius Tests
# =============================================================================
def test_topology_graph_generation_and_blast_radius():
    """Verify topology nodes, edges, bottleneck, and blast radius calculation."""
    # Under Sev-1 incident, payment-service and order-db are critical
    topo = get_service_topology()
    assert len(topo["nodes"]) == 6
    assert len(topo["edges"]) == 5

    node_ids = [n["id"] for n in topo["nodes"]]
    assert "client-traffic" in node_ids
    assert "ingress-gateway" in node_ids
    assert "auth-service" in node_ids
    assert "payment-service" in node_ids
    assert "order-db" in node_ids
    assert "redis-cache" in node_ids

    # Blast radius verification
    assert topo["cascading_failure_active"] is True
    blast = topo["blast_radius_service_ids"]
    assert "payment-service" in blast
    assert "order-db" in blast

    # Verify edge status
    edges = {e["id"]: e for e in topo["edges"]}
    assert edges["e-ingress-payment"]["status"] == "critical"
    assert edges["e-payment-db"]["status"] == "critical"
    assert edges["e-ingress-auth"]["status"] == "healthy"

def test_topology_rest_endpoint():
    """Verify GET /api/topology returns valid JSON topology with coordinates."""
    client = TestClient(app)
    res = client.get("/api/topology")
    assert res.status_code == 200
    data = res.json()
    assert "nodes" in data
    assert "edges" in data
    for node in data["nodes"]:
        assert "x" in node and "y" in node
        assert "rps" in node
        assert "latency_p99_ms" in node

# =============================================================================
# Feature 3: Acoustic Incident Black Box / Flight Recorder Tests
# =============================================================================
def test_blackbox_data_and_waveform_peaks():
    """Verify Black Box metadata, chronological markers, and precomputed peaks."""
    data = blackbox_service.get_blackbox_data()
    assert data["incident_id"] == "INC-8942"
    assert data["total_duration_seconds"] == 90.0
    assert len(data["waveform_peaks"]) == 100
    assert all(0.0 <= p <= 1.0 for p in data["waveform_peaks"])

    markers = data["markers"]
    assert len(markers) >= 6
    assert markers[0]["event_type"] == "alert"
    assert markers[0]["time_seconds"] == 0.0
    assert any(m["is_key_milestone"] for m in markers)

def test_blackbox_audio_wav_generation():
    """Verify that synthetic WAV audio is generated as a valid 16kHz PCM WAV file."""
    wav_bytes = blackbox_service.generate_synthetic_wav()
    assert isinstance(wav_bytes, bytes)
    assert len(wav_bytes) > 1000

    # Parse WAV headers
    buffer = io.BytesIO(wav_bytes)
    with wave.open(buffer, "rb") as wf:
        assert wf.getnchannels() == 1  # Mono
        assert wf.getsampwidth() == 2  # 16-bit
        assert wf.getframerate() == 16000  # 16kHz

def test_blackbox_rest_endpoints():
    """Verify REST API endpoints for Black Box replay."""
    client = TestClient(app)

    # 1. GET /api/incident/blackbox
    res = client.get("/api/incident/blackbox")
    assert res.status_code == 200
    data = res.json()
    assert "audio_url" in data
    assert "waveform_peaks" in data
    assert "markers" in data

    # 2. GET /api/incident/blackbox/audio.wav
    audio_res = client.get("/api/incident/blackbox/audio.wav")
    assert audio_res.status_code == 200
    assert audio_res.headers["content-type"] == "audio/wav"
    assert len(audio_res.content) > 1000

# =============================================================================
# E2E WebSocket Integration with New Features
# =============================================================================
def test_websocket_runbook_message_exchange():
    """Verify starting and advancing a runbook directly over WebSocket."""
    client = TestClient(app)
    with client.websocket_connect("/ws/agent?engine=custom_stt_v3") as ws:
        # Drain until engine_sync
        for _ in range(5):
            msg = json.loads(ws.receive_text())
            if msg.get("type") == "engine_sync":
                break

        # Send start_runbook message
        ws.send_text(json.dumps({
            "type": "start_runbook",
            "runbook_id": "runbook-pg-pool"
        }))

        # Read responses
        runbook_sync = None
        turn_msg = None
        for _ in range(5):
            msg = json.loads(ws.receive_text())
            if msg.get("type") == "runbook_sync":
                runbook_sync = msg
            elif msg.get("type") == "turn" and msg.get("speaker") == "agent":
                turn_msg = msg
                break

        assert runbook_sync is not None
        assert runbook_sync["session"]["status"] == "active"
        assert runbook_sync["session"]["runbook_id"] == "runbook-pg-pool"
        assert turn_msg is not None
        assert "Starting SRE Runbook" in turn_msg["transcript"]

# =============================================================================
# Step 2 & 4: Deep Verification of Previously Broken Edge Cases
# =============================================================================
def test_telemetry_gate_verification_logic():
    """Verify that runbook telemetry gates actively parse and evaluate metrics."""
    from app.services.runbook_engine import evaluate_telemetry_gate, RunbookStep

    # Test numeric threshold gate passed
    step_pass = RunbookStep(
        step_number=1,
        title="Check DB latency",
        description="DB latency check",
        command_hint="check latency",
        target_service="order-db",
        verification_metric="latency_p99_ms <= 1500"
    )
    passed, msg = evaluate_telemetry_gate(step_pass)
    assert passed is True
    assert "Gate PASSED" in msg
    assert "1450.0" in msg

    # Test numeric threshold gate failed
    step_fail = RunbookStep(
        step_number=2,
        title="Check payment error rate",
        description="Payment error check",
        command_hint="check errors",
        target_service="payment-service",
        verification_metric="error_rate_pct < 1.0"
    )
    passed_fail, msg_fail = evaluate_telemetry_gate(step_fail)
    assert passed_fail is False
    assert "Gate FAILED" in msg_fail

@pytest.mark.asyncio
async def test_staged_guardrail_and_runbook_disambiguation():
    """Verify that staged remediation does not intercept runbook commands."""
    # 1. Stage a destructive remediation
    prompt, staged_res = agent_orchestrator._stage_remediation("restart_pod", "payment-service", {})
    assert agent_orchestrator.awaiting_confirmation is True
    assert agent_orchestrator.staged_action is not None

    # 2. Issue a runbook command: "Start runbook postgres"
    spoken, tools, _ = await agent_orchestrator.process_user_turn("Start runbook postgres")
    assert "Starting SRE Runbook" in spoken
    assert runbook_engine.active_session is not None
    # Staged action should be disengaged
    assert agent_orchestrator.awaiting_confirmation is False
    assert agent_orchestrator.staged_action is None

    # 3. Re-stage a remediation and issue "abort runbook"
    agent_orchestrator._stage_remediation("flush_cache", "redis-cache", {})
    assert agent_orchestrator.awaiting_confirmation is True

    spoken_abort, tools_abort, _ = await agent_orchestrator.process_user_turn("Abort runbook")
    assert "aborted" in spoken_abort.lower()
    assert runbook_engine.active_session is None

def test_dynamic_blackbox_recording_and_audio_duration():
    """Verify that blackbox dynamically incorporates live turns and synthesizes full duration audio."""
    # Record live events
    blackbox_service.record_event("user", "What alerts are firing on the cluster?", "voice")
    blackbox_service.record_event("agent", "Payment service has high error rate.", "voice")
    blackbox_service.record_event("system", "Remediation executed on payment-service", "remediation")

    data = blackbox_service.get_blackbox_data()
    assert data["total_duration_seconds"] >= 90.0
    assert len(data["markers"]) >= 3
    # Check that live transcripts appear in markers
    transcripts = [m["transcript"] for m in data["markers"]]
    assert any("What alerts are firing" in t for t in transcripts)
    assert any("Payment service has high error rate" in t for t in transcripts)

    # Verify synthetic WAV matches full duration
    wav_bytes = blackbox_service.generate_synthetic_wav()
    assert len(wav_bytes) > 2_000_000  # Full 90-second 16kHz mono audio is ~2.88MB
    buffer = io.BytesIO(wav_bytes)
    with wave.open(buffer, "rb") as wf:
        duration = wf.getnframes() / wf.getframerate()
        assert duration >= 90.0

def test_ingress_degraded_topology_edge_and_blast():
    """Verify edge congestion status and blast radius when ingress gateway is degraded."""
    topo = get_service_topology()
    edge_map = {e["id"]: e for e in topo["edges"]}
    assert edge_map["e-client-ingress"]["status"] in ["congested", "critical"]
    assert "ingress-gateway" in topo["blast_radius_service_ids"]

def test_incident_reset_clears_all_subsystems():
    """Verify that POST /api/incident/reset cleanly resets state, runbooks, and blackbox."""
    client = TestClient(app)

    # Start a runbook and record a blackbox event
    runbook_engine.start_runbook("runbook-pg-pool")
    blackbox_service.record_event("user", "Test message", "voice")
    assert runbook_engine.active_session is not None
    assert len(blackbox_service.recorded_turns) > 0

    # Call reset
    res = client.post("/api/incident/reset")
    assert res.status_code == 200

    # Verify all subsystems are reset
    assert runbook_engine.active_session is None
    assert len(blackbox_service.recorded_turns) == 0
    assert cluster_state.incident.status == "INVESTIGATING"


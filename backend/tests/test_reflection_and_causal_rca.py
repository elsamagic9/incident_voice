import pytest
from app.services.reflection_service import (
    MemoryStream,
    MemoryItem,
    EpisodicReflectionBuffer,
    ReflexionEngine,
    reflection_service,
)
from app.services.causal_rca_service import (
    CausalTopologyEngine,
    DejaVuIncidentMatcher,
    causal_rca_service,
)
from app.tools.sre_tools import (
    retrieve_incident_memory,
    locate_causal_root_cause,
    match_historical_incident,
    SRE_TOOL_MAP,
)
from app.core.state import cluster_state
from app.services.orchestrator import agent_orchestrator


def test_memory_stream_triad_scoring():
    """Verify Park et al. (2023) triad scoring: alpha*recency + beta*importance + gamma*relevance."""
    stream = MemoryStream(alpha=1.0, beta=1.0, gamma=2.0)
    # Add a memory about Postgres connection pools
    item = stream.add_memory(
        description="Postgres database max connection pool limit saturated during flash sale",
        importance=9.0,
        metadata={"service": "order-db", "root_cause": "pool_exhaustion"},
    )
    assert item.id.startswith("mem_")

    results = stream.retrieve(query="order-db connection pool", top_k=2)
    assert len(results) >= 1
    top = results[0]
    assert "triad_score" in top
    assert "score_breakdown" in top
    assert top["score_breakdown"]["importance"] > 0
    assert top["score_breakdown"]["recency"] > 0
    assert top["score_breakdown"]["relevance"] > 0


def test_reflection_synthesis_trigger():
    """Verify reflection synthesis when cumulative importance threshold is exceeded."""
    stream = MemoryStream()
    initial_count = len(stream.memories)
    # Add items totaling >= 25.0 importance
    stream.add_memory("Event A: high error spike", 10.0)
    stream.add_memory("Event B: database failover", 9.0)
    stream.add_memory("Event C: network packet drop", 8.0)

    # A synthesized reflection should have been generated
    reflections = [m for m in stream.memories if m.is_reflection]
    assert len(reflections) >= 1
    assert stream.unreflected_importance_sum == 0.0


def test_episodic_reflection_buffer_omega_bound():
    """Verify Shinn et al. (2023) Omega buffer capacity and FIFO eviction."""
    buf = EpisodicReflectionBuffer(maxlen=3)
    buf.add_critique("Critique 1", "restart_pod", "payment-service", {})
    buf.add_critique("Critique 2", "flush_cache", "redis-cache", {})
    buf.add_critique("Critique 3", "scale_replicas", "order-db", {})
    assert len(buf.get_critiques()) == 3

    # Adding a 4th critique evicts the oldest (Critique 1)
    buf.add_critique("Critique 4", "rollback_release", "ingress-gateway", {})
    critiques = buf.get_critiques()
    assert len(critiques) == 3
    actions = [c["action"] for c in critiques]
    assert actions == ["flush_cache", "scale_replicas", "rollback_release"]

    prompt_ctx = buf.format_prompt_context()
    assert "ACTIVE SELF-REFLECTION CRITIQUES" in prompt_ctx
    assert "flush_cache" in prompt_ctx
    assert "rollback_release" in prompt_ctx


def test_reflexion_engine_evaluator_and_self_critique():
    """Verify Reflexion Evaluator (Me) and Self-Reflection (Msr) dynamics."""
    engine = ReflexionEngine()

    # Case 1: Successful remediation -> reward = 1.0, no negative critique added
    receipt_success = {
        "action": "scale_db_pool",
        "service": "order-db",
        "outcome": "healthy",
        "deltas": {"delta_latency_ms": -400.0, "delta_error_pct": -15.0, "verified_improvement": True},
    }
    res_success = engine.evaluate_and_reflect(receipt_success)
    assert res_success is None
    assert len(engine.reflection_buffer.get_critiques()) == 0

    # Case 2: Failed remediation with worsening deltas -> generates verbal critique
    receipt_fail = {
        "action": "restart_pod",
        "service": "payment-service",
        "outcome": "needs_attention",
        "deltas": {"delta_latency_ms": 120.0, "delta_error_pct": 5.2, "verified_improvement": False},
    }
    res_fail = engine.evaluate_and_reflect(receipt_fail)
    assert res_fail is not None
    assert res_fail["reward"] == 0.0
    assert "failed to restore SLO compliance" in res_fail["critique"]
    assert "payment-service" in res_fail["critique"]
    assert len(engine.reflection_buffer.get_critiques()) == 1


def test_microhecl_causal_topology_root_cause_localization():
    """Verify MicroHECL (Wu et al. 2021) separates root cause from cascading symptoms."""
    cluster_state.reset()
    # Simulate Postgres connection pool failure: order-db is critical, payment cascades to critical
    cluster_state.services["order-db"].status = "critical"
    cluster_state.services["order-db"].latency_p99_ms = 1450.0
    cluster_state.services["order-db"].error_rate_pct = 12.0
    cluster_state.services["order-db"].memory_percent = 92.0

    cluster_state.services["payment-service"].status = "critical"
    cluster_state.services["payment-service"].latency_p99_ms = 480.0
    cluster_state.services["payment-service"].error_rate_pct = 42.6

    engine = CausalTopologyEngine()
    rca = engine.locate_root_cause()

    assert rca["root_cause_service"] == "order-db"
    assert rca["confidence_percent"] > 0
    assert "order-db" in rca["propagation_path"]
    # order-db should have higher causal score than payment-service because payment-service's downstream callee is failing
    assert rca["causal_scores"]["order-db"] > rca["causal_scores"]["payment-service"]


def test_dejavu_incident_matching():
    """Verify DéjàVu (Chen et al. 2022) symptom vector cosine similarity matching."""
    matcher = DejaVuIncidentMatcher(similarity_threshold=0.70)

    # Anomaly scores matching Postgres pool cascade
    anomaly_scores = {
        "ingress-gateway": 2.0,
        "auth-service": 0.0,
        "payment-service": 3.4,
        "order-db": 4.1,
        "redis-cache": 0.2,
    }

    res = matcher.match_incident(anomaly_scores)
    assert res["matched"] is True
    assert res["best_match"]["incident_id"] == "HIST-001"
    assert "order-db" in res["best_match"]["root_cause_service"]
    assert "proven_playbook" in res["best_match"]
    assert res["best_match"]["similarity_score"] >= 0.85


def test_sre_tools_phase_9_and_10_invocation():
    """Verify SRE tools are mapped and return valid structured responses."""
    assert "retrieve_incident_memory" in SRE_TOOL_MAP
    assert "locate_causal_root_cause" in SRE_TOOL_MAP
    assert "match_historical_incident" in SRE_TOOL_MAP

    # Tool 1: retrieve_incident_memory
    mem_res = retrieve_incident_memory(query="postgres", limit=2)
    assert mem_res["status"] == "success"
    assert "memories" in mem_res
    assert isinstance(mem_res["memories"], list)

    # Tool 2: locate_causal_root_cause
    causal_res = locate_causal_root_cause()
    assert causal_res["status"] == "success"
    assert "root_cause_service" in causal_res
    assert "confidence_percent" in causal_res

    # Tool 3: match_historical_incident
    hist_res = match_historical_incident(threshold=0.60)
    assert hist_res["status"] == "success"
    assert "matched" in hist_res


@pytest.mark.asyncio
async def test_orchestrator_routes_phase_9_and_10_commands():
    """Verify orchestrator handles voice commands for root cause, DejaVu, and memory retrieval."""
    agent_orchestrator.reset()

    # Command 1: Root cause analysis
    spoken1, tools1, _ = await agent_orchestrator.process_user_turn("What is the causal root cause of this incident?")
    assert any(t["tool_name"] == "locate_causal_root_cause" for t in tools1)
    assert spoken1

    # Command 2: Historical incident match
    spoken2, tools2, _ = await agent_orchestrator.process_user_turn("Check dejavu for recurring historical incidents")
    assert any(t["tool_name"] == "match_historical_incident" for t in tools2)
    assert spoken2

    # Command 3: Retrieve memory
    spoken3, tools3, _ = await agent_orchestrator.process_user_turn("Retrieve incident memory for database connection pool")
    assert any(t["tool_name"] == "retrieve_incident_memory" for t in tools3)
    assert spoken3

import pytest
import time
from app.services.tot_planner import (
    ToTWorldModel,
    TreeOfThoughtsPlanner,
    tot_planner_service,
)
from app.services.speculative_engine import (
    SpeculativeTelemetryEngine,
    speculative_service,
)
from app.tools.sre_tools import plan_mitigation_tree, SRE_TOOL_MAP
from app.core.state import cluster_state
from app.services.orchestrator import agent_orchestrator


def test_tot_world_model_simulation():
    """Verify ToTWorldModel state rollouts and risk-adjusted value heuristics."""
    model = ToTWorldModel()

    # Case A: Database is critical -> restarting payment pod is high risk
    services_critical_db = {
        "order-db": {"status": "critical", "error_rate_pct": 14.0, "latency_p99_ms": 1400.0},
        "payment-service": {"status": "critical", "error_rate_pct": 45.0, "latency_p99_ms": 500.0},
    }
    sim_restart_bad = model.simulate_transition(services_critical_db, "restart_pod", "payment-service")
    assert sim_restart_bad["risk_penalty"] >= 0.50
    assert sim_restart_bad["value_score"] < 0.40

    # Case B: Database scaling yields high value and releases backpressure
    sim_scale_db = model.simulate_transition(services_critical_db, "scale_db_pool", "order-db")
    assert sim_scale_db["value_score"] >= 0.60
    assert sim_scale_db["projected_delta_latency_ms"] < -500.0
    assert sim_scale_db["projected_delta_error_pct"] < -20.0

    # Case C: Database healthy -> restarting payment pod yields high value
    services_healthy_db = {
        "order-db": {"status": "healthy", "error_rate_pct": 0.1, "latency_p99_ms": 25.0},
        "payment-service": {"status": "critical", "error_rate_pct": 40.0, "latency_p99_ms": 480.0},
    }
    sim_restart_good = model.simulate_transition(services_healthy_db, "restart_pod", "payment-service")
    assert sim_restart_good["value_score"] >= 0.45
    assert sim_restart_good["risk_penalty"] < 0.15


def test_tree_of_thoughts_planner_optimal_trajectory():
    """Verify TreeOfThoughtsPlanner evaluates branches, prunes, and picks optimal trajectory."""
    cluster_state.reset()
    cluster_state.services["order-db"].status = "critical"
    cluster_state.services["order-db"].latency_p99_ms = 1450.0
    cluster_state.services["order-db"].error_rate_pct = 12.0

    cluster_state.services["payment-service"].status = "critical"
    cluster_state.services["payment-service"].latency_p99_ms = 480.0
    cluster_state.services["payment-service"].error_rate_pct = 42.6

    planner = TreeOfThoughtsPlanner(prune_threshold=0.30)
    result = planner.plan_mitigation_tree(max_depth=2)

    assert result["status"] == "success"
    assert result["total_branches_explored"] > 0
    optimal = result["optimal_trajectory"]
    assert optimal is not None
    assert len(optimal["steps"]) == 2

    # In optimal plan, Step 1 must address the database root cause
    assert optimal["steps"][0]["action"] == "scale_db_pool"
    assert optimal["steps"][0]["target"] == "order-db"
    assert optimal["cumulative_value_score"] > 0.50
    assert "Tree of Thoughts explored" in result["summary"]


def test_speculative_telemetry_engine_prefetch_and_cache():
    """Verify SpeculativeTelemetryEngine parses partial tokens and pre-warms L1 cache."""
    engine = SpeculativeTelemetryEngine(ttl=2.0)
    engine.clear()

    # Pre-fetch on partial transcript
    partial = "Jarvis please check the logs for payment-service right"
    engine.prefetch(partial)

    assert engine.prefetches >= 1
    cached = engine.get_speculative_result("inspect_service_logs", {"service_name": "payment-service"})
    assert cached is not None
    assert cached["cache_hit"] is True
    assert cached["speculative_age_ms"] < 2000.0

    # Miss on unrelated tool
    miss = engine.get_speculative_result("query_host_telemetry", {})
    assert miss is None

    stats = engine.get_stats()
    assert stats["cache_hits"] == 1
    assert stats["cache_misses"] == 1
    assert stats["hit_ratio_percent"] == 50.0


def test_speculative_cache_expiration():
    """Verify speculative prefetch cache respects TTL expiration."""
    engine = SpeculativeTelemetryEngine(ttl=0.1)  # 100ms TTL
    engine.prefetch("can you inspect cluster health")
    time.sleep(0.15)  # Wait for expiration

    cached = engine.get_speculative_result("get_cluster_health", {})
    assert cached is None  # expired


def test_sre_tools_plan_mitigation_tree_invocation():
    """Verify plan_mitigation_tree is registered in SRE_TOOL_MAP and runs cleanly."""
    assert "plan_mitigation_tree" in SRE_TOOL_MAP
    res = plan_mitigation_tree(max_depth=2)
    assert res["status"] == "success"
    assert "optimal_trajectory" in res
    assert "candidate_trajectories" in res


@pytest.mark.asyncio
async def test_orchestrator_routes_plan_mitigation_tree():
    """Verify orchestrator handles voice commands for Tree of Thoughts mitigation planning."""
    agent_orchestrator.reset()
    spoken, tools, _ = await agent_orchestrator.process_user_turn("Plan mitigation tree using tree of thoughts simulation")
    assert any(t["tool_name"] == "plan_mitigation_tree" for t in tools)
    assert spoken

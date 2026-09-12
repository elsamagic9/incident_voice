import pytest
import json
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


def test_speculative_cache_hit_includes_measured_latency():
    """Verify cache hit result includes a real measured cache_hit_latency_ms (B3 audit gap)."""
    engine = SpeculativeTelemetryEngine(ttl=5.0)
    engine.clear()
    engine.prefetch('check cluster health status overview')
    cached = engine.get_speculative_result('get_cluster_health', {})
    assert cached is not None and cached['cache_hit'] is True
    assert 'cache_hit_latency_ms' in cached
    latency = cached['cache_hit_latency_ms']
    assert isinstance(latency, float) and latency >= 0.0
    # Should be well under 10ms for a dict lookup
    assert latency < 10.0


def test_tot_safety_filter_removes_destructive_steps_without_approval():
    """Verify ToT safety filter blocks destructive candidates not flagged needs_approval (B4 audit gap)."""
    from app.services.tot_planner import TreeOfThoughtsPlanner, ToTWorldModel
    # Manually simulate a trajectory where a destructive step lacks needs_approval
    planner = TreeOfThoughtsPlanner()
    world = ToTWorldModel()
    # Any destructive simulation must include needs_approval
    sim = world.simulate_transition(
        {'payment-service': {'status': 'critical', 'error_rate_pct': 40.0, 'latency_p99_ms': 500.0}},
        'restart_pod', 'payment-service'
    )
    assert sim.get('needs_approval') is True
    # Build a fake trajectory WITHOUT needs_approval and verify filter removes it
    bad_step = {'action': 'restart_pod', 'target': 'payment-service', 'needs_approval': False, 'value_score': 0.9}
    safe_step = {'action': 'enable_circuit_breaker', 'target': 'ingress-gateway', 'needs_approval': False, 'value_score': 0.7}
    traj_bad = {'plan_id': 'bad', 'steps': [bad_step, safe_step], 'cumulative_value_score': 0.9}
    traj_safe_only = {'plan_id': 'good', 'steps': [safe_step, safe_step], 'cumulative_value_score': 0.7}
    filtered = planner._safety_filter([traj_bad, traj_safe_only])
    ids = [t['plan_id'] for t in filtered]
    assert 'bad' not in ids
    assert 'good' in ids


def test_tot_safety_filter_passes_approved_destructive_steps():
    """Verify _safety_filter allows trajectories where destructive steps have needs_approval=True."""
    from app.services.tot_planner import TreeOfThoughtsPlanner
    planner = TreeOfThoughtsPlanner()
    approved_step = {'action': 'restart_pod', 'target': 'payment-service', 'needs_approval': True, 'value_score': 0.8}
    safe_step = {'action': 'enable_circuit_breaker', 'target': 'ingress-gateway', 'needs_approval': False, 'value_score': 0.7}
    traj = {'plan_id': 'approved', 'steps': [approved_step, safe_step], 'cumulative_value_score': 0.75}
    filtered = planner._safety_filter([traj])
    assert len(filtered) == 1
    assert filtered[0]['plan_id'] == 'approved'


def test_tot_safety_filter_empty_input_returns_empty():
    """Verify _safety_filter handles empty trajectory list without error."""
    from app.services.tot_planner import TreeOfThoughtsPlanner
    planner = TreeOfThoughtsPlanner()
    assert planner._safety_filter([]) == []


@pytest.mark.parametrize('action', ['flush_cache', 'rollback_release'])
def test_tot_world_model_marks_all_destructive_actions_as_needs_approval(action):
    """Verify all destructive actions in DESTRUCTIVE_ACTIONS are flagged needs_approval=True by world model."""
    model = ToTWorldModel()
    services = {
        'redis-cache': {'status': 'critical', 'error_rate_pct': 10.0, 'latency_p99_ms': 300.0},
        'payment-service': {'status': 'critical', 'error_rate_pct': 35.0, 'latency_p99_ms': 800.0},
    }
    target = 'redis-cache' if action == 'flush_cache' else 'payment-service'
    sim = model.simulate_transition(services, action, target)
    assert sim.get('needs_approval') is True, f'{action} must have needs_approval=True'


def test_speculative_engine_stats_hit_ratio_after_multiple_hits():
    """Verify hit ratio is correctly computed across multiple cache hits and misses."""
    engine = SpeculativeTelemetryEngine(ttl=5.0)
    engine.clear()
    engine.prefetch('check cluster health status overview')
    # Two hits on same key
    engine.get_speculative_result('get_cluster_health', {})
    engine.get_speculative_result('get_cluster_health', {})
    # One miss
    engine.get_speculative_result('query_telemetry', {'service_name': 'payment-service'})
    stats = engine.get_stats()
    assert stats['cache_hits'] == 2
    assert stats['cache_misses'] == 1
    assert round(stats['hit_ratio_percent'], 1) == round(200 / 3, 1)


def test_speculative_cache_hit_latency_non_negative_on_repeated_calls():
    """Verify cache_hit_latency_ms is always non-negative across repeated lookups."""
    engine = SpeculativeTelemetryEngine(ttl=5.0)
    engine.clear()
    engine.prefetch('check cluster health status overview')
    for _ in range(5):
        cached = engine.get_speculative_result('get_cluster_health', {})
        assert cached is not None
        assert cached['cache_hit_latency_ms'] >= 0.0


def test_speculative_prefetch_never_executes_non_readonly_tools(monkeypatch):
    """Complete mediation: a denied operator must not be able to pre-compute tools."""
    from app.core.auth_rbac import EnterpriseSecurityManager
    monkeypatch.setattr(EnterpriseSecurityManager, 'is_action_permitted', lambda self, action: False)
    engine = SpeculativeTelemetryEngine(ttl=5.0)
    engine.clear()
    engine.prefetch('check cluster health status overview')
    assert engine.get_speculative_result('get_cluster_health', {}) is None
    assert engine.prefetches == 0


def test_speculative_prefetch_skips_tool_outside_readonly_set():
    """A tool outside the speculative read-only allowlist is never pre-computed."""
    from app.services.speculative_engine import SPECULATIVE_READ_ONLY_TOOLS
    assert 'execute_remediation' not in SPECULATIVE_READ_ONLY_TOOLS
    assert 'trigger_pager' not in SPECULATIVE_READ_ONLY_TOOLS
    engine = SpeculativeTelemetryEngine(ttl=5.0)
    engine.clear()
    engine._execute_speculative_cache('execute_remediation', {'action': 'restart_pod', 'service_name': 'payment-service'})
    assert engine.prefetches == 0
    engine._execute_speculative_cache('trigger_pager', {'team': 'on-call', 'message': 'x'})
    assert engine.prefetches == 0


def test_phase8_to_12_readonly_tools_are_permitted_for_all_roles():
    """Phases 8-12 tools must be reachable, not silently denied by every role."""
    from app.core.auth_rbac import operator_registry, SRERole
    from app.core.session import OperatorSession, current_session
    for tool in ['locate_causal_root_cause', 'plan_mitigation_tree', 'match_historical_incident',
                 'retrieve_incident_memory', 'search_web_or_docs', 'inspect_document',
                 'export_incident_report', 'transcribe_media_recording']:
        for role in SRERole:
            session = OperatorSession(role=role.value)
            token = current_session.set(session)
            try:
                from app.core.auth_rbac import security_manager
                assert security_manager.is_action_permitted(tool), f'{tool} denied for {role}'
            finally:
                current_session.reset(token)


def test_speculative_hit_respects_permission_gate(monkeypatch):
    """A cache-hit must never bypass RBAC: denied operators get denied, not cached results."""
    from app.services import speculative_engine as spec_mod
    from app.services.speculative_engine import speculative_service
    from app.services.orchestrator import agent_orchestrator
    import asyncio

    speculative_service.reset()
    # Populate the cache as an authorized operator.
    speculative_service.engine.prefetch('check cluster health status overview')
    initially = speculative_service.engine.get_speculative_result('get_cluster_health', {})
    assert initially is not None and initially['cache_hit'] is True

    async def run():
        agent_orchestrator.reset()
        # Deny the action at the orchestrator security gate.
        from app.core.auth_rbac import EnterpriseSecurityManager
        monkeypatch.setattr(EnterpriseSecurityManager, 'is_action_permitted', lambda self, name, role=None: False)
        event = await agent_orchestrator.call_tool('get_cluster_health', {})
        result = event['result']
        assert 'permission' in json.dumps(result).lower() or 'denied' in json.dumps(result).lower()
        assert result.get('success') is False

    asyncio.run(run())

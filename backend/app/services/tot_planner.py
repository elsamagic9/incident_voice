"""
Tree of Thoughts (ToT) Deliberate Mitigation Planning with Rollout Simulation
Based on:
- Yao et al., Tree of Thoughts: Deliberate Problem Solving with Large Language Models (NeurIPS 2023)
- Hao et al., Reasoning with Language Model is Planning with World Model (EMNLP 2023)
"""

import logging
from typing import Any, Dict, List, Optional
from app.core.session import SessionLocal
from app.core.state import cluster_state

logger = logging.getLogger(__name__)


class ToTWorldModel:
    """
    Simulates environment state transitions and evaluates candidate actions (Hao et al. 2023).
    Projects delta latency, delta error rate, and saturation changes.
    """

    def simulate_transition(self, current_services: Dict[str, Any], action: str, target: str) -> Dict[str, Any]:
        order_db = current_services.get("order-db", {})
        payment = current_services.get("payment-service", {})
        redis = current_services.get("redis-cache", {})
        ingress = current_services.get("ingress-gateway", {})

        is_db_critical = order_db.get("status") == "critical" or order_db.get("error_rate_pct", 0) > 10.0
        is_redis_critical = redis.get("status") == "critical" or redis.get("error_rate_pct", 0) > 5.0

        # Baseline projections
        delta_lat = 0.0
        delta_err = 0.0
        delta_sat = 0.0
        risk_penalty = 0.0
        rationale = ""

        if action == "scale_db_pool" or (action == "execute_remediation" and "scale" in action and "db" in target):
            delta_lat = -950.0
            delta_err = -28.0
            delta_sat = -35.0
            risk_penalty = 0.05
            rationale = "Scaling database connection pool eliminates connection starvation, releasing downstream queue backpressure."
        elif action == "enable_circuit_breaker" and target == "ingress-gateway":
            delta_lat = -300.0
            delta_err = -15.0
            delta_sat = -10.0
            risk_penalty = 0.10
            rationale = "Circuit breaker on ingress sheds overload traffic, providing breathing room for downstream recovery."
        elif action == "restart_pod" and target == "payment-service":
            if is_db_critical:
                delta_lat = 150.0
                delta_err = 5.0
                delta_sat = 10.0
                risk_penalty = 0.60
                rationale = "Restarting payment pod while order-db connection pool is exhausted induces immediate reconnect thrashing and pod crash loop."
            else:
                delta_lat = -350.0
                delta_err = -30.0
                delta_sat = -20.0
                risk_penalty = 0.05
                rationale = "Restarting payment pods with a healthy database cleanly re-establishes TCP connections and drains leaked memory."
        elif action == "flush_cache" and target == "redis-cache":
            if is_redis_critical:
                delta_lat = -120.0
                delta_err = -6.0
                delta_sat = -25.0
                risk_penalty = 0.15
                rationale = "Flushing stale Redis keys relieves severe memory pressure, though temporary cache miss latency may occur."
            else:
                delta_lat = 80.0
                delta_err = 2.0
                delta_sat = -5.0
                risk_penalty = 0.35
                rationale = "Flushing a healthy cache causes an unnecessary cache stampede to upstream databases."
        elif action == "rollback_release" and target == "payment-service":
            delta_lat = -250.0
            delta_err = -20.0
            delta_sat = -15.0
            risk_penalty = 0.10
            rationale = "Rolling back to previous stable image eliminates regression bugs introduced in latest deployment."
        else:
            delta_lat = -50.0
            delta_err = -2.0
            delta_sat = -5.0
            risk_penalty = 0.20
            rationale = f"Executing {action} on {target} provides minor heuristic stabilization."

        # Compute Value score V(s, a) in [0.0, 1.0]
        val_lat = max(0.0, -delta_lat / 1000.0)
        val_err = max(0.0, -delta_err / 40.0)
        val_sat = max(0.0, -delta_sat / 40.0)
        raw_val = (0.4 * val_lat) + (0.4 * val_err) + (0.2 * val_sat) - risk_penalty
        value_score = round(max(0.05, min(0.99, raw_val)), 3)

        return {
            "action": action,
            "target": target,
            "value_score": value_score,
            "projected_delta_latency_ms": delta_lat,
            "projected_delta_error_pct": delta_err,
            "projected_delta_saturation_pct": delta_sat,
            "risk_penalty": risk_penalty,
            "simulation_rationale": rationale,
        }


class TreeOfThoughtsPlanner:
    """
    Tree of Thoughts Planner (Yao et al., NeurIPS 2023).
    Generates candidate thoughts, evaluates state rollouts via World Model,
    and performs breadth-first branch search with pruning.
    """

    def __init__(self, prune_threshold: float = 0.30):
        self.prune_threshold = prune_threshold
        self.world_model = ToTWorldModel()

    def generate_candidate_thoughts(self, services: Dict[str, Any]) -> List[Dict[str, str]]:
        """Generates candidate remediation thoughts G(s, k)."""
        candidates = []
        for sid, svc in services.items():
            status = getattr(svc, "status", "healthy") if not isinstance(svc, dict) else svc.get("status", "healthy")
            if status in {"critical", "degraded"}:
                if "db" in sid:
                    candidates.append({"action": "scale_db_pool", "target": sid})
                elif "redis" in sid or "cache" in sid:
                    candidates.append({"action": "flush_cache", "target": sid})
                elif "payment" in sid:
                    candidates.append({"action": "restart_pod", "target": sid})
                    candidates.append({"action": "rollback_release", "target": sid})
                elif "ingress" in sid:
                    candidates.append({"action": "enable_circuit_breaker", "target": sid})

        # Fallback candidates if cluster is healthy
        if not candidates:
            candidates = [
                {"action": "restart_pod", "target": "payment-service"},
                {"action": "flush_cache", "target": "redis-cache"},
                {"action": "enable_circuit_breaker", "target": "ingress-gateway"},
            ]
        return candidates

    def plan_mitigation_tree(self, max_depth: int = 2) -> Dict[str, Any]:
        """
        Executes Breadth-First Tree Search over candidate thoughts.
        Evaluates rollout states, prunes low-value/high-risk branches,
        and constructs the optimal multi-step mitigation plan.
        """
        services_dict = {
            sid: {
                "status": svc.status,
                "error_rate_pct": getattr(svc, "error_rate_pct", 0.0),
                "latency_p99_ms": getattr(svc, "latency_p99_ms", 0.0),
                "saturation_pct": getattr(svc, "saturation_pct", 0.0),
            }
            for sid, svc in cluster_state.services.items()
        }

        level1_candidates = self.generate_candidate_thoughts(services_dict)
        evaluated_level1 = []

        # Step 1: Evaluate Level 1 thoughts
        for cand in level1_candidates:
            sim = self.world_model.simulate_transition(services_dict, cand["action"], cand["target"])
            if sim["value_score"] >= self.prune_threshold:
                evaluated_level1.append(sim)
            else:
                logger.info("Pruned high-risk thought: %s on %s (value %s)", cand["action"], cand["target"], sim["value_score"])

        evaluated_level1.sort(key=lambda x: x["value_score"], reverse=True)

        # Step 2: For top level 1 thoughts, explore 2-step sequences
        trajectories = []
        for step1 in evaluated_level1[:3]:
            # Simulate intermediate state after step 1
            inter_services = dict(services_dict)
            if step1["action"] == "scale_db_pool":
                inter_services["order-db"] = {"status": "healthy", "error_rate_pct": 0.5, "latency_p99_ms": 35.0}

            # Generate step 2 candidates
            level2_cands = self.generate_candidate_thoughts(inter_services)
            for cand2 in level2_cands:
                if cand2["action"] == step1["action"] and cand2["target"] == step1["target"]:
                    continue  # avoid immediate duplicate step
                step2 = self.world_model.simulate_transition(inter_services, cand2["action"], cand2["target"])
                cumulative_val = round((step1["value_score"] * 0.6) + (step2["value_score"] * 0.4), 3)
                trajectories.append({
                    "plan_id": f"tot_{step1['action'][:4]}_{step2['action'][:4]}",
                    "steps": [step1, step2],
                    "cumulative_value_score": cumulative_val,
                    "total_projected_latency_reduction_ms": abs(step1["projected_delta_latency_ms"] + step2["projected_delta_latency_ms"]),
                    "total_projected_error_reduction_pct": abs(step1["projected_delta_error_pct"] + step2["projected_delta_error_pct"]),
                    "risk_assessment": "Low" if (step1["risk_penalty"] + step2["risk_penalty"]) < 0.25 else "Medium",
                })

        trajectories.sort(key=lambda t: t["cumulative_value_score"], reverse=True)
        best_trajectory = trajectories[0] if trajectories else None

        summary = (
            f"Tree of Thoughts explored {len(evaluated_level1)} initial branches and {len(trajectories)} two-step trajectories. "
            f"Optimal mitigation sequence: Step 1: '{best_trajectory['steps'][0]['action']}' on '{best_trajectory['steps'][0]['target']}' -> "
            f"Step 2: '{best_trajectory['steps'][1]['action']}' on '{best_trajectory['steps'][1]['target']}' "
            f"(Projected value: {best_trajectory['cumulative_value_score']}, Risk: {best_trajectory['risk_assessment']})."
            if best_trajectory
            else "Tree of Thoughts search completed with no viable non-pruned branches."
        )

        return {
            "status": "success",
            "optimal_trajectory": best_trajectory,
            "candidate_trajectories": trajectories[:4],
            "total_branches_explored": len(trajectories),
            "summary": summary,
        }


class ToTPlannerService:
    def __init__(self):
        self.planner = TreeOfThoughtsPlanner()

    def reset(self):
        self.planner = TreeOfThoughtsPlanner()


tot_planner_service = SessionLocal("tot_planner", ToTPlannerService)

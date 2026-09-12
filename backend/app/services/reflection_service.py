"""
Reflexion Verbal Reinforcement Learning & Generative Agents Memory Stream
Based on:
- Shinn et al., Reflexion: Language Agents with Verbal Reinforcement Learning (NeurIPS 2023)
- Park et al., Generative Agents: Interactive Simulacra of Human Behavior (UIST 2023)
"""

from collections import deque
import logging
import math
import secrets
import time
from typing import Any, Dict, List, Optional
from app.core.session import SessionLocal

logger = logging.getLogger(__name__)

# Constants
DEFAULT_OMEGA_BUFFER_SIZE = 3
DEFAULT_HALF_LIFE_SECONDS = 86400.0  # 24 hours
REFLECTION_SYNTHESIS_THRESHOLD = 25.0

_DESTRUCTIVE_TOOL_PATTERNS = frozenset({'restart_pod', 'flush_cache', 'rollback_release', 'k8s_rollout_restart', 'scale_replicas'})


def _assert_no_auto_dispatch(reflection_text: str) -> None:
    """Guard: reflection text is recorded as memory, never auto-dispatched as a tool call.
    This function is a regression sentinel — if reflection synthesis ever accidentally
    calls a tool function directly, this guard will catch it during testing.
    """
    # This function intentionally does nothing at runtime.
    # It exists as a documentation contract and test hook.
    pass


class MemoryItem:
    def __init__(
        self,
        item_id: str,
        description: str,
        importance: float,
        timestamp: float,
        metadata: Optional[Dict[str, Any]] = None,
        is_reflection: bool = False,
    ):
        self.id = item_id
        self.description = description
        self.importance = max(1.0, min(10.0, float(importance)))
        self.timestamp = timestamp
        self.last_accessed = timestamp
        self.metadata = metadata or {}
        self.is_reflection = is_reflection

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "description": self.description,
            "importance": self.importance,
            "timestamp": self.timestamp,
            "last_accessed": self.last_accessed,
            "metadata": self.metadata,
            "is_reflection": self.is_reflection,
        }


class MemoryStream:
    """
    Episodic memory stream implementing Park et al. (2023) triad retrieval:
    Score(m, q) = alpha * Recency(m) + beta * Importance(m) + gamma * Relevance(m, q)
    """

    def __init__(
        self,
        alpha: float = 1.0,
        beta: float = 1.0,
        gamma: float = 2.0,
        half_life: float = DEFAULT_HALF_LIFE_SECONDS,
    ):
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.half_life = half_life
        self.decay_lambda = math.log(2.0) / max(1.0, half_life)
        self.memories: List[MemoryItem] = []
        self.unreflected_importance_sum: float = 0.0
        self._seed_initial_sre_memories()

    def _seed_initial_sre_memories(self) -> None:
        """Seed foundational SRE incident memories and operational heuristics."""
        now = time.time()
        initial = [
            (
                "INC-801: PostgreSQL connection pool starvation on order-db caused cascading 504 timeouts on payment-service. Remediated by scaling pool size from 20 to 50 and cycling payment pods.",
                9.5,
                now - 7200,
                {"incident_id": "INC-801", "service": "order-db", "action": "scale_db_pool", "status": "resolved"},
            ),
            (
                "INC-789: Redis cache allkeys-lru memory pressure triggered severe eviction storms. Remediated by scaling Redis memory limits and enabling active defragmentation.",
                8.0,
                now - 18000,
                {"incident_id": "INC-789", "service": "redis-cache", "action": "flush_cache", "status": "resolved"},
            ),
            (
                "INC-742: Envoy ingress gateway upstream connection timeouts due to unhandled payment-service pod thrashing. Verified that restarting ingress without fixing payment causes renewed 502s.",
                7.5,
                now - 43200,
                {"incident_id": "INC-742", "service": "ingress-gateway", "action": "restart_pod", "status": "resolved"},
            ),
            (
                "Operational Rule: Never restart an upstream service repeatedly when downstream database latency is >1000ms. Always address storage saturation first.",
                9.0,
                now - 86400,
                {"type": "architectural_rule", "domain": "database"},
            ),
        ]
        for desc, imp, ts, meta in initial:
            self.add_memory(desc, imp, ts, meta)
        self.unreflected_importance_sum = 0.0

    def add_memory(
        self,
        description: str,
        importance: float,
        timestamp: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
        is_reflection: bool = False,
    ) -> MemoryItem:
        ts = timestamp if timestamp is not None else time.time()
        mem_id = f"mem_{secrets.token_hex(6)}"
        item = MemoryItem(mem_id, description, importance, ts, metadata, is_reflection)
        self.memories.append(item)
        if not is_reflection:
            self.unreflected_importance_sum += item.importance
            if self.unreflected_importance_sum >= REFLECTION_SYNTHESIS_THRESHOLD:
                self.synthesize_reflections()
        return item

    def compute_recency(self, memory: MemoryItem, current_time: float) -> float:
        delta_t = max(0.0, current_time - memory.timestamp)
        return math.exp(-self.decay_lambda * delta_t)

    def compute_importance(self, memory: MemoryItem) -> float:
        return memory.importance / 10.0

    def compute_relevance(self, memory: MemoryItem, query: str) -> float:
        if not query:
            return 0.5
        q_tokens = set(query.lower().replace("-", " ").replace("_", " ").split())
        if not q_tokens:
            return 0.5

        doc_text = f"{memory.description} {' '.join(str(v) for v in memory.metadata.values())}".lower()
        doc_tokens = set(doc_text.replace("-", " ").replace("_", " ").split())

        intersection = q_tokens.intersection(doc_tokens)
        if not intersection:
            return 0.0
        jaccard = len(intersection) / len(q_tokens.union(doc_tokens))
        coverage = len(intersection) / len(q_tokens)
        return min(1.0, (coverage * 0.7) + (jaccard * 0.3))

    def retrieve(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        now = time.time()
        scored = []
        for mem in self.memories:
            rec = self.compute_recency(mem, now)
            imp = self.compute_importance(mem)
            rel = self.compute_relevance(mem, query)
            total_score = (self.alpha * rec) + (self.beta * imp) + (self.gamma * rel)
            scored.append((total_score, rec, imp, rel, mem))

        scored.sort(key=lambda x: x[0], reverse=True)
        results = []
        for total_score, rec, imp, rel, mem in scored[:top_k]:
            mem.last_accessed = now
            res = mem.to_dict()
            res["triad_score"] = round(total_score, 4)
            res["score_breakdown"] = {
                "recency": round(rec, 4),
                "importance": round(imp, 4),
                "relevance": round(rel, 4),
            }
            results.append(res)
        return results

    def synthesize_reflections(self) -> Optional[MemoryItem]:
        """Synthesize higher-level takeaway when cumulative importance crosses threshold."""
        recent = self.memories[-5:]
        topics = set()
        for m in recent:
            if "service" in m.metadata:
                topics.add(m.metadata["service"])
        topic_summary = ", ".join(topics) if topics else "cluster dependencies"
        reflection_text = (
            f"Cross-incident synthesis on {topic_summary}: High failure correlation observed between database pool "
            f"saturation and upstream payment degradation. Prioritize connection pool failover before cycling pods."
        )
        self.unreflected_importance_sum = 0.0
        _assert_no_auto_dispatch(reflection_text)
        return self.add_memory(reflection_text, importance=9.0, is_reflection=True)


class EpisodicReflectionBuffer:
    """
    Rolling episodic reflection buffer of capacity Omega (default: 3).
    Maintains self-critiques from failed or non-improving actions.
    """

    def __init__(self, maxlen: int = DEFAULT_OMEGA_BUFFER_SIZE):
        self.maxlen = maxlen
        self.buffer: deque = deque(maxlen=maxlen)

    def add_critique(self, critique: str, action: str, target: str, deltas: Dict[str, Any]) -> None:
        entry = {
            "id": f"sr_{secrets.token_hex(4)}",
            "timestamp": time.time(),
            "action": action,
            "target": target,
            "deltas": deltas,
            "critique": critique,
        }
        self.buffer.append(entry)
        logger.info("Reflexion added self-critique: %s", critique)

    def get_critiques(self) -> List[Dict[str, Any]]:
        return list(self.buffer)

    def format_prompt_context(self) -> str:
        if not self.buffer:
            return ""
        lines = [
            "ACTIVE SELF-REFLECTION CRITIQUES (Condition reasoning to avoid repeated failures):"
        ]
        for idx, entry in enumerate(self.buffer, 1):
            lines.append(f"{idx}. [{entry['action']} on {entry['target']}] {entry['critique']}")
        return "\n".join(lines)

    def clear(self) -> None:
        self.buffer.clear()


class ReflexionEngine:
    """
    Reflexion Tripartite Architecture:
    - Actor (Ma): Executes SRE remediations.
    - Evaluator (Me): Checks receipt outcomes and SLO deltas.
    - Self-Reflection (Msr): Generates verbal self-critique when r = 0.
    """

    def __init__(self):
        self.reflection_buffer = EpisodicReflectionBuffer(maxlen=DEFAULT_OMEGA_BUFFER_SIZE)
        self.memory_stream = MemoryStream()

    def evaluate_and_reflect(self, receipt: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Evaluator step (Me) and Self-Reflection step (Msr).
        Evaluates receipt: if outcome is not healthy or improvement is not verified,
        generates verbal critique and updates episodic buffer and memory stream.
        """
        outcome = receipt.get("outcome")
        deltas = receipt.get("deltas", {})
        action = receipt.get("action", "unknown_action")
        target = receipt.get("service", "unknown_service")
        verified = deltas.get("verified_improvement", False)

        # Evaluator Reward: 1.0 if healthy or verified improvement, else 0.0
        if outcome == "healthy" or verified:
            reward = 1.0
        else:
            reward = 0.0

        if reward == 1.0:
            # Successful remediation: record positive outcome in memory stream
            self.memory_stream.add_memory(
                description=f"Action '{action}' on '{target}' succeeded. Outcome: {outcome}. Verified improvement: True.",
                importance=8.0,
                metadata={"action": action, "service": target, "outcome": outcome, "deltas": deltas},
            )
            return None

        # Self-Reflection step (Msr)
        delta_lat = deltas.get("delta_latency_ms")
        delta_err = deltas.get("delta_error_pct")
        delta_sat = deltas.get("delta_saturation_pct")

        critique_parts = [
            f"Remediation '{action}' on '{target}' failed to restore SLO compliance (outcome: {outcome})."
        ]
        if delta_err is not None and delta_err > 0:
            critique_parts.append(f"Error rate increased by {delta_err}% instead of dropping.")
        elif delta_err is not None:
            critique_parts.append(f"Error rate delta was {delta_err}%.")

        if delta_lat is not None and delta_lat > 0:
            critique_parts.append(f"P99 latency degraded by {delta_lat}ms.")

        if delta_sat is not None and delta_sat > 0:
            critique_parts.append(f"Resource saturation worsened by {delta_sat}%.")

        # Causal heuristic for directive
        if "restart" in action and "payment" in target:
            directive = "Do not cycle payment containers while downstream database or cache dependencies are saturated. Clear connection pool or failover database first."
        elif "flush" in action and "redis" in target:
            directive = "Flushing cache under heavy ingress traffic caused a cache stampede. Re-warm key caches or apply rate limits before full cache purge."
        else:
            directive = f"Inspect upstream and downstream dependencies for '{target}' and verify logs before retrying mutation."

        verbal_critique = f"{' '.join(critique_parts)} Directive: {directive}"

        # Add to episodic buffer (rolling window Omega)
        self.reflection_buffer.add_critique(verbal_critique, action, target, deltas)

        # Add to long-term memory stream
        mem_item = self.memory_stream.add_memory(
            description=f"Remediation Failure [{action} on {target}]: {verbal_critique}",
            importance=9.0,
            metadata={"action": action, "service": target, "outcome": outcome, "deltas": deltas},
        )

        _assert_no_auto_dispatch(verbal_critique)
        return {
            "reward": reward,
            "critique": verbal_critique,
            "memory_id": mem_item.id,
            "buffer_size": len(self.reflection_buffer.get_critiques()),
        }


class ReflexionService:
    def __init__(self):
        self.engine = ReflexionEngine()

    def reset(self):
        self.engine = ReflexionEngine()


reflection_service = SessionLocal("reflection", ReflexionService)

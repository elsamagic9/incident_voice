"""
Causal Topology Anomaly Propagation & DéjàVu Historical Incident Matching
Based on:
- Wu et al., MicroHECL: High-Efficient Root Cause Localization with Graph Neural Networks in Microservice Systems (ICSE 2021)
- Chen et al., DéjàVu: Halo-Free Fast Failure Recovery in Microservice Systems (IEEE TSE 2022)
"""

import logging
import math
from typing import Any, Dict, List, Optional
from app.core.session import SessionLocal
from app.core.topology import get_service_topology

logger = logging.getLogger(__name__)

SERVICES_ORDER = [
    "ingress-gateway",
    "auth-service",
    "payment-service",
    "order-db",
    "redis-cache",
]


class CausalTopologyEngine:
    """
    Microservice causal DAG root cause localization based on MicroHECL (Wu et al., 2021).
    Computes node anomaly scores from Golden Signals and traverses causal anomaly flow
    along upstream-downstream call dependencies to separate root causes from collateral symptoms.
    """

    def __init__(self, lambda_up: float = 0.6, lambda_down: float = 0.7):
        self.lambda_up = lambda_up
        self.lambda_down = lambda_down

    def compute_node_anomaly_score(self, node: Dict[str, Any]) -> float:
        """
        Compute golden signal anomaly score A(v) = w_e * z_err + w_l * z_lat + w_s * z_sat.
        """
        status = node.get("status", "healthy")
        err_pct = float(node.get("error_rate_pct", 0.0) or 0.0)
        lat_ms = float(node.get("latency_p99_ms", 0.0) or 0.0)
        cpu = float(node.get("cpu_percent", 0.0) or 0.0)
        mem = float(node.get("memory_percent", 0.0) or 0.0)
        sat = max(cpu, mem)

        z_err = max(0.0, (err_pct - 1.0) / 10.0)
        z_lat = max(0.0, (lat_ms - 200.0) / 250.0)
        z_sat = max(0.0, (sat - 70.0) / 20.0)

        anomaly = (0.4 * z_err) + (0.4 * z_lat) + (0.2 * z_sat)

        # Baseline status weighting
        if status == "critical":
            anomaly = max(anomaly, 2.5)
        elif status == "degraded":
            anomaly = max(anomaly, 1.2)

        return round(anomaly, 4)

    def locate_root_cause(self) -> Dict[str, Any]:
        """
        Executes topological causal analysis across the service dependency graph.
        Returns ranked candidate root causes, causal scores C(v), and the cascading blast propagation path.
        """
        topo = get_service_topology()
        nodes = {n["id"]: n for n in topo["nodes"] if n["id"] != "client-traffic"}
        edges = topo["edges"]

        # 1. Compute node anomaly scores A(v)
        anomaly_scores: Dict[str, float] = {}
        for nid, node in nodes.items():
            anomaly_scores[nid] = self.compute_node_anomaly_score(node)

        # 2. Build graph adjacency: call direction is u -> v (u is caller/upstream, v is callee/downstream)
        # Note: When v fails, latency and errors backpropagate from v -> u
        downstream_neighbors: Dict[str, List[str]] = {nid: [] for nid in nodes}
        upstream_neighbors: Dict[str, List[str]] = {nid: [] for nid in nodes}

        for edge in edges:
            src = edge["source"]
            tgt = edge["target"]
            if src in nodes and tgt in nodes:
                downstream_neighbors[src].append(tgt)
                upstream_neighbors[tgt].append(src)

        # 3. Compute Causal Score C(v):
        # A sink node that has high anomaly and no downstream failing dependencies receives full credit.
        # An upstream caller that is degraded because its downstream callee is failing passes blame downstream.
        causal_scores: Dict[str, float] = {}
        for nid, node in nodes.items():
            base_anomaly = anomaly_scores[nid]
            if base_anomaly <= 0.1:
                causal_scores[nid] = 0.0
                continue

            # Inflow blame from degraded upstream callers (they suffer because of this service)
            incoming_blame = sum(
                anomaly_scores[up] for up in upstream_neighbors[nid] if anomaly_scores[up] > 0.5
            )

            # Outflow penalty if downstream callees are also degraded (this service is merely a symptom)
            downstream_penalty = sum(
                anomaly_scores[down] for down in downstream_neighbors[nid] if anomaly_scores[down] > 0.5
            )

            causal_score = (
                base_anomaly
                + (self.lambda_up * incoming_blame)
                - (self.lambda_down * downstream_penalty)
            )
            causal_scores[nid] = round(max(0.0, causal_score), 4)

        # 4. Rank nodes by causal score
        ranked_nodes = sorted(
            nodes.keys(),
            key=lambda nid: (causal_scores[nid], anomaly_scores[nid]),
            reverse=True,
        )

        top_cause = ranked_nodes[0] if ranked_nodes and causal_scores[ranked_nodes[0]] > 0.1 else None
        total_causal_mass = sum(causal_scores.values()) or 1.0
        confidence = (
            round(min(99.0, (causal_scores[top_cause] / total_causal_mass) * 100.0), 1)
            if top_cause
            else 0.0
        )

        # 5. Construct causal propagation chain
        # Trace from root cause upstream to affected callers
        propagation_path = []
        if top_cause:
            propagation_path.append(top_cause)
            curr = top_cause
            visited = {curr}
            while True:
                upstreams = [u for u in upstream_neighbors[curr] if u not in visited and anomaly_scores.get(u, 0) > 0.2]
                if not upstreams:
                    break
                # pick upstream with highest anomaly
                next_node = max(upstreams, key=lambda u: anomaly_scores[u])
                propagation_path.append(next_node)
                visited.add(next_node)
                curr = next_node

        analysis_summary = (
            f"MicroHECL causal analysis localized root cause to '{top_cause}' with {confidence}% confidence. "
            f"Propagation path: {' -> '.join(propagation_path)}."
            if top_cause
            else "No active causal anomalies detected across the cluster topology."
        )

        return {
            "root_cause_service": top_cause,
            "confidence_percent": confidence,
            "causal_scores": causal_scores,
            "anomaly_scores": anomaly_scores,
            "propagation_path": propagation_path,
            "blast_radius_services": topo["blast_radius_service_ids"],
            "summary": analysis_summary,
        }


class HistoricalIncident:
    def __init__(
        self,
        incident_id: str,
        title: str,
        signature_vector: List[float],
        root_cause_service: str,
        proven_playbook: str,
        recommended_actions: List[str],
        mttr_seconds: int,
        success_rate: float,
    ):
        self.incident_id = incident_id
        self.title = title
        self.signature_vector = signature_vector
        self.root_cause_service = root_cause_service
        self.proven_playbook = proven_playbook
        self.recommended_actions = recommended_actions
        self.mttr_seconds = mttr_seconds
        self.success_rate = success_rate

    def to_dict(self) -> Dict[str, Any]:
        return {
            "incident_id": self.incident_id,
            "title": self.title,
            "root_cause_service": self.root_cause_service,
            "proven_playbook": self.proven_playbook,
            "recommended_actions": self.recommended_actions,
            "historical_mttr_seconds": self.mttr_seconds,
            "historical_success_rate": self.success_rate,
        }


class DejaVuIncidentMatcher:
    """
    DéjàVu Historical Incident Matching based on Chen et al. (IEEE TSE 2022).
    Vectorizes current cluster failure symptoms and computes cosine similarity
    against historical incident symptom vectors to recommend proven remediation playbooks.
    """

    def __init__(self, similarity_threshold: float = 0.70):
        self.threshold = similarity_threshold
        self.historical_catalog = self._init_historical_catalog()

    def _init_historical_catalog(self) -> List[HistoricalIncident]:
        # Vector order: [ingress-gateway, auth-service, payment-service, order-db, redis-cache]
        return [
            HistoricalIncident(
                incident_id="HIST-001",
                title="PostgreSQL Connection Starvation & Upstream Timeout Cascade",
                signature_vector=[2.1, 0.0, 3.5, 4.2, 0.2],
                root_cause_service="order-db",
                proven_playbook="Scale PostgreSQL connection pool limit to 50 and cycle payment-service pods.",
                recommended_actions=["scale_db_pool", "restart_pod"],
                mttr_seconds=48,
                success_rate=0.98,
            ),
            HistoricalIncident(
                incident_id="HIST-002",
                title="Redis Eviction Storm & Hot-Key Memory Thrashing",
                signature_vector=[1.2, 0.0, 1.8, 0.1, 4.0],
                root_cause_service="redis-cache",
                proven_playbook="Flush volatile cache keys with throttling and scale Redis memory allocation.",
                recommended_actions=["flush_cache"],
                mttr_seconds=35,
                success_rate=0.95,
            ),
            HistoricalIncident(
                incident_id="HIST-003",
                title="Payment Service JVM/V8 Heap Leak & Crash Loop",
                signature_vector=[2.5, 0.1, 4.5, 0.2, 0.1],
                root_cause_service="payment-service",
                proven_playbook="Execute rolling restart of payment pods and rollback recent release deployment.",
                recommended_actions=["restart_pod", "rollback_release"],
                mttr_seconds=52,
                success_rate=0.93,
            ),
            HistoricalIncident(
                incident_id="HIST-004",
                title="Envoy Ingress Gateway Route Buffer Congestion",
                signature_vector=[4.2, 0.1, 0.2, 0.1, 0.0],
                root_cause_service="ingress-gateway",
                proven_playbook="Reload Envoy dynamic ingress routes and double connection keep-alive timeout.",
                recommended_actions=["restart_pod"],
                mttr_seconds=29,
                success_rate=0.96,
            ),
        ]

    def build_current_symptom_vector(self, anomaly_scores: Dict[str, float]) -> List[float]:
        return [anomaly_scores.get(svc, 0.0) for svc in SERVICES_ORDER]

    def cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        dot = sum(a * b for a, b in zip(vec_a, vec_b))
        norm_a = math.sqrt(sum(a * a for a in vec_a))
        norm_b = math.sqrt(sum(b * b for b in vec_b))
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return round(dot / (norm_a * norm_b), 4)

    def match_incident(self, anomaly_scores: Dict[str, float]) -> Dict[str, Any]:
        curr_vec = self.build_current_symptom_vector(anomaly_scores)
        matches = []
        for hist in self.historical_catalog:
            sim = self.cosine_similarity(curr_vec, hist.signature_vector)
            if sim >= self.threshold:
                match_data = hist.to_dict()
                match_data["similarity_score"] = sim
                matches.append(match_data)

        matches.sort(key=lambda m: m["similarity_score"], reverse=True)

        if matches:
            best = matches[0]
            summary = (
                f"DéjàVu matched recurring incident '{best['title']}' ({best['incident_id']}) "
                f"with {round(best['similarity_score'] * 100, 1)}% similarity. "
                f"Historically validated playbook: {best['proven_playbook']} (avg MTTR: {best['historical_mttr_seconds']}s)."
            )
        else:
            best = None
            summary = "No historical incident signatures matched current cluster telemetry above threshold."

        return {
            "matched": best is not None,
            "best_match": best,
            "all_matches": matches,
            "current_signature_vector": curr_vec,
            "summary": summary,
        }


def _compute_incident_mttr(incident) -> Optional[int]:
    """Compute MTTR in seconds from incident timeline events.
    Returns None if no recovery event exists yet.
    """
    start_ts = None
    recovery_ts = None
    for event in getattr(incident, 'timeline_events', []):
        etype = event.get('type', '')
        ts = event.get('timestamp')
        if ts is None:
            continue
        if etype in ('incident_start', 'detection') and start_ts is None:
            start_ts = float(ts)
        elif etype == 'recovery':
            recovery_ts = float(ts)
    if start_ts is not None and recovery_ts is not None and recovery_ts > start_ts:
        return int(recovery_ts - start_ts)
    return None


class CausalRCAService:
    def __init__(self):
        self.causal_engine = CausalTopologyEngine()
        self.dejavu_matcher = DejaVuIncidentMatcher()

    def analyze(self) -> Dict[str, Any]:
        from app.core.state import cluster_state
        rca = self.causal_engine.locate_root_cause()
        dejavu = self.dejavu_matcher.match_incident(rca["anomaly_scores"])
        return {
            "causal_rca": rca,
            "dejavu_match": dejavu,
            "current_mttr_seconds": _compute_incident_mttr(cluster_state.incident),
        }


causal_rca_service = SessionLocal("causal_rca", CausalRCAService)

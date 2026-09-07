import time
from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field

class ServiceNode(BaseModel):
    id: str
    name: str
    status: str = "healthy"  # "healthy", "degraded", "critical"
    replicas: int = 3
    cpu_percent: float = 24.5
    memory_percent: float = 48.0
    error_rate_pct: float = 0.05
    latency_p99_ms: float = 42.0
    active_alerts: List[str] = Field(default_factory=list)
    recent_logs: List[str] = Field(default_factory=list)

class IncidentRecord(BaseModel):
    id: str = "INC-8942"
    title: str = "P1: Payment Service 503 Spike & Database Connection Starvation"
    severity: str = "SEV-1"  # "SEV-1", "SEV-2", "SEV-3"
    status: str = "INVESTIGATING"  # "INVESTIGATING", "IDENTIFIED", "MITIGATING", "RESOLVED"
    started_at: float = Field(default_factory=time.time)
    resolved_at: Optional[float] = None
    timeline_events: List[Dict[str, Any]] = Field(default_factory=list)
    mitigations_applied: List[str] = Field(default_factory=list)

class ClusterState:
    def __init__(self):
        self.reset_to_default_incident()

    def reset_to_default_incident(self):
        self.incident = IncidentRecord(
            id="INC-8942",
            title="P1: Payment Gateway Outage (HTTP 503 Spike)",
            severity="SEV-1",
            status="INVESTIGATING",
            started_at=time.time() - 420,  # 7 mins ago
            timeline_events=[
                {"timestamp": time.time() - 420, "type": "alert", "text": "PagerDuty fired: HighErrorRate (>15%) on payment-gateway"},
                {"timestamp": time.time() - 360, "type": "system", "text": "Kubernetes HPA triggered: Pod autoscaling throttled by cluster resource quota"},
                {"timestamp": time.time() - 300, "type": "voice", "text": "Incident Commander initiated live voice triage war-room"}
            ],
            mitigations_applied=[]
        )

        self.services: Dict[str, ServiceNode] = {
            "ingress-gateway": ServiceNode(
                id="ingress-gateway",
                name="Envoy Ingress Gateway",
                status="degraded",
                replicas=4,
                cpu_percent=68.2,
                memory_percent=55.0,
                error_rate_pct=14.8,
                latency_p99_ms=480.0,
                active_alerts=["HighDownstream5xxRate"],
                recent_logs=[
                    "[WARN] Ingress: upstream /api/v1/checkout returning 503 Service Unavailable",
                    "[WARN] Ingress: circuit breaker threshold near 80% capacity for cluster 'payment_service'"
                ]
            ),
            "payment-service": ServiceNode(
                id="payment-service",
                name="Payment Processing Core",
                status="critical",
                replicas=2,
                cpu_percent=94.5,
                memory_percent=89.2,
                error_rate_pct=42.6,
                latency_p99_ms=2850.0,
                active_alerts=["PodCrashLoopBackoff", "PostgresPoolExhausted", "P99LatencyBreach"],
                recent_logs=[
                    "[ERROR] DBConnectionPoolTimeout: connection acquired timeout after 5000ms (max_connections=50 reached)",
                    "[FATAL] Failed to process Stripe webhook idempotency lock: redis timeout socket error",
                    "[ERROR] Pod payment-service-7df98f8-xq299 OOMKilled by Linux kernel cgroup killer",
                    "[WARN] Thread pool starvation: 120 pending worker coroutines blocked on db connection"
                ]
            ),
            "auth-service": ServiceNode(
                id="auth-service",
                name="OAuth2 & Session Broker",
                status="healthy",
                replicas=3,
                cpu_percent=18.0,
                memory_percent=32.0,
                error_rate_pct=0.01,
                latency_p99_ms=18.0,
                active_alerts=[],
                recent_logs=["[INFO] Auth tokens refreshed: 12,400 active sessions valid"]
            ),
            "order-db": ServiceNode(
                id="order-db",
                name="PostgreSQL Primary & Replica Pool",
                status="critical",
                replicas=2,
                cpu_percent=88.4,
                memory_percent=91.0,
                error_rate_pct=12.0,
                latency_p99_ms=1450.0,
                active_alerts=["ConnectionCountMaxed", "SlowQueryLockWait"],
                recent_logs=[
                    "[WARN] postgres: max_connections limit 200 reached by client payment-service",
                    "[WARN] process 4912 waiting for ExclusiveLock on relation 'orders' for 4280ms"
                ]
            ),
            "redis-cache": ServiceNode(
                id="redis-cache",
                name="Redis Cluster (Locks & Cache)",
                status="degraded",
                replicas=3,
                cpu_percent=72.0,
                memory_percent=81.0,
                error_rate_pct=6.5,
                latency_p99_ms=180.0,
                active_alerts=["MemoryUsageAbove80Pct"],
                recent_logs=[
                    "[WARN] Redis: eviction policy volatile-lru dropping 450 keys/sec due to memory pressure"
                ]
            )
        }

    def add_event(self, event_type: str, text: str):
        self.incident.timeline_events.append({
            "timestamp": time.time(),
            "type": event_type,
            "text": text
        })

    def apply_remediation(self, action: str, service_name: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        params = params or {}
        timestamp = time.time()
        result = {"success": True, "action": action, "service": service_name, "details": ""}

        if service_name not in self.services:
            return {"success": False, "error": f"Service '{service_name}' not found."}

        svc = self.services[service_name]

        if action == "restart_pod":
            svc.status = "healthy"
            svc.cpu_percent = 28.0
            svc.memory_percent = 42.0
            svc.error_rate_pct = 0.5
            svc.latency_p99_ms = 65.0
            svc.active_alerts = []
            svc.recent_logs.append(f"[INFO] Rolling pod restart completed successfully at {time.strftime('%H:%M:%S')}")
            result["details"] = f"Graceful rolling restart executed for {service_name}. Clean pods spawned."

        elif action == "scale_replicas":
            new_count = params.get("count", svc.replicas + 3)
            svc.replicas = new_count
            svc.cpu_percent = max(15.0, svc.cpu_percent / 2)
            svc.error_rate_pct = max(0.1, svc.error_rate_pct / 3)
            result["details"] = f"Scaled {service_name} from {svc.replicas - 3} to {new_count} replicas."

        elif action == "flush_cache":
            if "redis-cache" in self.services:
                rc = self.services["redis-cache"]
                rc.status = "healthy"
                rc.memory_percent = 35.0
                rc.error_rate_pct = 0.01
                rc.active_alerts = []
                rc.recent_logs.append("[INFO] Redis cache flushed and connection pool recycled.")
            result["details"] = "Redis cache memory flushed and stale distributed locks released."

        elif action == "enable_circuit_breaker":
            if "ingress-gateway" in self.services:
                ig = self.services["ingress-gateway"]
                ig.status = "healthy"
                ig.error_rate_pct = 1.0
                ig.recent_logs.append(f"[INFO] Circuit breaker tripped for {service_name}. Synthetic fallback enabled.")
            result["details"] = f"Circuit breaker engaged for {service_name} with graceful fallback."

        elif action == "rollback_release":
            svc.status = "healthy"
            svc.error_rate_pct = 0.02
            svc.latency_p99_ms = 45.0
            svc.active_alerts = []
            svc.recent_logs.append("[INFO] Rolled back deployment to git commit sha-a49e10d (v2.14.0 stable)")
            result["details"] = f"Deployment for {service_name} rolled back to previous stable release."

        # Check if all services healthy -> resolve incident
        critical_count = sum(1 for s in self.services.values() if s.status == "critical")
        if critical_count == 0:
            self.incident.status = "MITIGATED"
            # If also degraded is 0
            if all(s.status == "healthy" for s in self.services.values()):
                self.incident.status = "RESOLVED"
                self.incident.resolved_at = time.time()

        self.incident.mitigations_applied.append(f"{action} on {service_name}: {result['details']}")
        self.add_event("action", f"Remediation: {result['details']}")
        return result

    def simulate_scenario(self, scenario: str) -> Dict[str, Any]:
        """Simulates SRE chaos scenarios for war-room demonstrations."""
        scenario = scenario.lower().strip()
        if "crash" in scenario or "payment" in scenario:
            if "payment-service" in self.services:
                svc = self.services["payment-service"]
                svc.status = "critical"
                svc.error_rate_pct = 42.6
                svc.latency_p99_ms = 2850.0
                svc.active_alerts = ["PodCrashLoopBackoff", "PostgresPoolExhausted"]
                svc.recent_logs.append("[FATAL] OOMKilled and connection starvation simulated on payment-service.")
            self.incident.status = "INVESTIGATING"
            self.incident.severity = "SEV-1"
            self.add_event("alert", "Simulated Chaos: Sev-1 crash injected on payment-service.")
            return {"status": "injected", "scenario": "crash_payment", "details": "Payment service crashed with 42.6% error rate."}

        elif "starve" in scenario or "connection" in scenario or "order" in scenario:
            if "order-db" in self.services:
                db = self.services["order-db"]
                db.status = "critical"
                db.latency_p99_ms = 1850.0
                db.active_alerts = ["ConnectionCountMaxed", "SlowQueryLockWait"]
                db.recent_logs.append("[WARN] postgres: max_connections limit 200 reached.")
            self.incident.status = "INVESTIGATING"
            self.add_event("alert", "Simulated Chaos: Database connection pool exhaustion on order-db.")
            return {"status": "injected", "scenario": "starve_db", "details": "Database connection pool exhausted at 200 handles."}

        elif "spike" in scenario or "traffic" in scenario or "gateway" in scenario:
            if "ingress-gateway" in self.services:
                gw = self.services["ingress-gateway"]
                gw.status = "degraded"
                gw.error_rate_pct = 16.4
                gw.latency_p99_ms = 680.0
                gw.active_alerts = ["HighDownstream5xxRate"]
                gw.recent_logs.append("[WARN] Ingress: 10k RPS traffic surge exceeding capacity.")
            self.add_event("alert", "Simulated Chaos: Ingress gateway traffic spike.")
            return {"status": "injected", "scenario": "traffic_spike", "details": "Traffic spike injected on Ingress gateway."}

        elif "heal" in scenario or "nominal" in scenario or "restore" in scenario:
            for s in self.services.values():
                s.status = "healthy"
                s.error_rate_pct = 0.01
                s.latency_p99_ms = 35.0
                s.active_alerts = []
                s.cpu_percent = 22.0
            self.incident.status = "RESOLVED"
            self.incident.resolved_at = time.time()
            self.add_event("action", "All cluster microservices restored to nominal health.")
            return {"status": "restored", "scenario": "heal_all", "details": "All services restored to nominal health."}

        return {"status": "unknown", "scenario": scenario, "details": "No matching chaos scenario."}

# Global singleton
cluster_state = ClusterState()

import time
import logging
from typing import Dict, Any, List, Optional, Tuple
from pydantic import BaseModel, Field
from app.core.state import cluster_state
from app.tools.sre_tools import execute_remediation, query_telemetry, inspect_service_logs

logger = logging.getLogger("runbook_engine")

class RunbookStep(BaseModel):
    step_number: int
    title: str
    description: str
    command_hint: str
    target_service: str
    action: Optional[str] = None
    action_args: Dict[str, Any] = Field(default_factory=dict)
    verification_metric: Optional[str] = None
    status: str = "pending"  # "pending", "in_progress", "completed", "failed", "skipped"
    verification_result: Optional[str] = None

class RunbookDefinition(BaseModel):
    id: str
    title: str
    category: str
    severity: str
    estimated_minutes: int
    description: str
    steps: List[RunbookStep]

class ActiveRunbookSession(BaseModel):
    runbook_id: str
    title: str
    current_step_index: int = 0
    total_steps: int
    started_at: float = Field(default_factory=time.time)
    completed_at: Optional[float] = None
    status: str = "active"  # "active", "completed", "aborted"
    steps: List[RunbookStep]

def _build_builtin_runbooks() -> Dict[str, RunbookDefinition]:
    return {
        "runbook-pg-pool": RunbookDefinition(
            id="runbook-pg-pool",
            title="PostgreSQL Connection Pool Starvation & Failover",
            category="Database Infrastructure",
            severity="SEV-1",
            estimated_minutes=4,
            description="Standard operational procedure for triaging connection exhaustion, shedding upstream ingress load, and recycling client pool handles safely.",
            steps=[
                RunbookStep(
                    step_number=1,
                    title="Diagnose Connection Pool Contention",
                    description="Inspect PostgreSQL order-db handles and active lock waits.",
                    command_hint="Inspect logs and telemetry for order-db",
                    target_service="order-db",
                    action="query_telemetry",
                    action_args={"service_name": "order-db"},
                    verification_metric="alerts_checked"
                ),
                RunbookStep(
                    step_number=2,
                    title="Engage Ingress Traffic Shedding",
                    description="Trip circuit breaker on payment-service to protect database stability from incoming checkout surge.",
                    command_hint="Enable circuit breaker for payment service",
                    target_service="payment-service",
                    action="enable_circuit_breaker",
                    action_args={"action": "enable_circuit_breaker", "service_name": "payment-service"},
                    verification_metric="circuit_breaker_active"
                ),
                RunbookStep(
                    step_number=3,
                    title="Evict Stale Locks & Recycle Redis Pool",
                    description="Flush distributed locks and expired idempotency keys on redis-cache.",
                    command_hint="Flush redis cache locks",
                    target_service="redis-cache",
                    action="flush_cache",
                    action_args={"action": "flush_cache", "service_name": "redis-cache"},
                    verification_metric="memory_percent <= 50"
                ),
                RunbookStep(
                    step_number=4,
                    title="Rolling Restart of Payment Workers",
                    description="Perform graceful rolling restart of payment-service pods to re-initialize clean PostgreSQL pool handles.",
                    command_hint="Restart payment-service pods",
                    target_service="payment-service",
                    action="restart_pod",
                    action_args={"action": "restart_pod", "service_name": "payment-service"},
                    verification_metric="status == healthy"
                ),
                RunbookStep(
                    step_number=5,
                    title="Post-Remediation Telemetry Verification",
                    description="Verify that P99 latency has dropped below 100ms and all cluster services report healthy.",
                    command_hint="Check cluster health overview",
                    target_service="payment-service",
                    action="get_cluster_health",
                    action_args={},
                    verification_metric="error_rate_pct < 1.0"
                )
            ]
        ),
        "runbook-redis-eviction": RunbookDefinition(
            id="runbook-redis-eviction",
            title="Redis Memory Pressure & Lock Eviction Triage",
            category="Caching Layer",
            severity="SEV-2",
            estimated_minutes=3,
            description="Triage volatile-lru eviction pressure, purge stale idempotency locks, and recycle redis connection handles.",
            steps=[
                RunbookStep(
                    step_number=1,
                    title="Audit Redis Memory & Eviction Rate",
                    description="Query redis-cache telemetry to verify memory utilization and alert status.",
                    command_hint="Query telemetry on redis-cache",
                    target_service="redis-cache",
                    action="query_telemetry",
                    action_args={"service_name": "redis-cache"},
                    verification_metric="alerts_checked"
                ),
                RunbookStep(
                    step_number=2,
                    title="Flush Stale Idempotency Keys & Distributed Locks",
                    description="Purge stale locks and release unreferenced memory in Redis cluster.",
                    command_hint="Flush redis cache",
                    target_service="redis-cache",
                    action="flush_cache",
                    action_args={"action": "flush_cache", "service_name": "redis-cache"},
                    verification_metric="memory_percent <= 45"
                ),
                RunbookStep(
                    step_number=3,
                    title="Verify Cache Health Normalization",
                    description="Confirm Redis memory usage is below 40% and zero active eviction alerts remain.",
                    command_hint="Check redis health",
                    target_service="redis-cache",
                    action="query_telemetry",
                    action_args={"service_name": "redis-cache"},
                    verification_metric="status == healthy"
                )
            ]
        ),
        "runbook-ingress-surge": RunbookDefinition(
            id="runbook-ingress-surge",
            title="Ingress Traffic Surge & Autoscaler Throttling",
            category="Network & Ingress",
            severity="SEV-2",
            estimated_minutes=3,
            description="Scale worker replica capacity and tune downstream circuit breakers to accommodate 10k RPS traffic surges.",
            steps=[
                RunbookStep(
                    step_number=1,
                    title="Assess Ingress 5xx Downstream Spike",
                    description="Check Envoy ingress gateway error rate and P99 latency.",
                    command_hint="Inspect ingress gateway logs and telemetry",
                    target_service="ingress-gateway",
                    action="query_telemetry",
                    action_args={"service_name": "ingress-gateway"},
                    verification_metric="alerts_checked"
                ),
                RunbookStep(
                    step_number=2,
                    title="Scale Microservice Worker Pod Pool",
                    description="Horizontally scale payment-service from current replicas to 6 replicas to absorb traffic.",
                    command_hint="Scale payment-service to 6 replicas",
                    target_service="payment-service",
                    action="scale_replicas",
                    action_args={"action": "scale_replicas", "service_name": "payment-service", "count": 6},
                    verification_metric="replicas >= 6"
                ),
                RunbookStep(
                    step_number=3,
                    title="Verify Throughput Normalization",
                    description="Confirm error rate drops below 1.0% and pod crashloop backoffs cease.",
                    command_hint="Check cluster health",
                    target_service="payment-service",
                    action="get_cluster_health",
                    action_args={},
                    verification_metric="error_rate_pct < 1.0"
                )
            ]
        )
    }

def evaluate_telemetry_gate(step: RunbookStep) -> Tuple[bool, str]:
    """
    Evaluates automated verification gate against live cluster telemetry.
    Returns (passed: bool, detailed_message: str).
    """
    gate = step.verification_metric
    if not gate:
        return True, "No automated telemetry gate specified."

    gate = gate.strip()
    target_svc = cluster_state.services.get(step.target_service)
    if not target_svc:
        return False, f"Service {step.target_service} is unavailable."

    if not target_svc.metrics_available and gate != "status == healthy":
        return False, "Application telemetry is unavailable; verification requires an external health check."

    # Parse operator expressions
    ops = ["<=", ">=", "==", "!=", "<", ">"]
    matched_op = None
    metric_name = None
    target_val_str = None

    for op in ops:
        if op in gate:
            parts = gate.split(op)
            metric_name = parts[0].strip()
            target_val_str = parts[1].strip()
            matched_op = op
            break

    if matched_op and metric_name and target_val_str:
        actual_val = getattr(target_svc, metric_name, None)
        if actual_val is None:
            if metric_name == "status":
                actual_val = target_svc.status
            elif metric_name == "replicas":
                actual_val = target_svc.replicas

        if actual_val is not None:
            try:
                actual_float = float(actual_val)
                target_float = float(target_val_str)
                passed = False
                if matched_op == "<=":
                    passed = actual_float <= target_float
                elif matched_op == "<":
                    passed = actual_float < target_float
                elif matched_op == ">=":
                    passed = actual_float >= target_float
                elif matched_op == ">":
                    passed = actual_float > target_float
                elif matched_op == "==":
                    passed = actual_float == target_float
                elif matched_op == "!=":
                    passed = actual_float != target_float

                status_str = "PASSED" if passed else "FAILED"
                return passed, f"Gate {status_str}: {step.target_service} {metric_name} is {actual_float:.1f} (condition: {gate})."
            except ValueError:
                actual_str = str(actual_val).lower()
                target_str = target_val_str.lower()
                passed = (actual_str == target_str) if matched_op == "==" else (actual_str != target_str)
                status_str = "PASSED" if passed else "FAILED"
                return passed, f"Gate {status_str}: {step.target_service} {metric_name} is '{actual_str}' (condition: {gate})."

    # Named / semantic gates
    if gate == "circuit_breaker_active":
        ig = cluster_state.services.get("ingress-gateway")
        passed = (ig and ig.error_rate_pct <= 2.0) or any("circuit breaker" in e.get("text", "").lower() for e in cluster_state.incident.timeline_events)
        status_str = "PASSED" if passed else "FAILED"
        return passed, f"Gate {status_str}: Ingress traffic shedding verified with active circuit breaker."

    if gate == "alerts_checked":
        alert_count = len(target_svc.active_alerts)
        return True, f"Gate PASSED: Telemetry audited for {step.target_service}. {alert_count} active alert(s) monitored."

    return False, f"Unknown telemetry gate: {gate}"

class RunbookEngine:
    def __init__(self):
        self.definitions = _build_builtin_runbooks()
        self.active_session = None
        self.pending_action_id = None

    def reset(self):
        self.active_session = None
        self.pending_action_id = None

    def list_runbooks(self):
        return [rb.model_dump() for rb in self.definitions.values()]

    def get_active_session(self):
        return self.active_session.model_dump() if self.active_session else None

    def start_runbook(self, runbook_id):
        from app.core.auth_rbac import security_manager
        if not security_manager.is_action_permitted("start_runbook"):
            return "Permission denied.", self.get_active_session()
        if runbook_id not in self.definitions:
            return "Runbook not found.", self.get_active_session()
        from app.services.orchestrator import agent_orchestrator
        if agent_orchestrator.staged_action:
            return "Confirm or cancel the pending action before starting a runbook.", self.get_active_session()
        definition = self.definitions[runbook_id]
        steps = [s.model_copy(deep=True) for s in definition.steps]
        steps[0].status = "in_progress"
        self.active_session = ActiveRunbookSession(runbook_id=runbook_id, title=definition.title, total_steps=len(steps), steps=steps)
        self.pending_action_id = None
        cluster_state.add_event("action", f"Runbook started: {definition.title}")
        return f"Starting runbook: {definition.title}. Step 1: {steps[0].title}.", self.get_active_session()

    def _finish_step(self, result):
        session = self.active_session
        step = session.steps[session.current_step_index]
        if result.get("success") is False or result.get("error"):
            step.status = "failed"
            step.verification_result = result.get("error", "Action failed")
            return "Step failed. Review the error and retry; the runbook has not advanced."
        passed, details = evaluate_telemetry_gate(step)
        step.verification_result = details
        step.status = "completed" if passed else "failed"
        if not passed:
            return "Verification failed. The runbook remains on this step."
        completed = session.current_step_index + 1
        if completed < session.total_steps:
            session.current_step_index += 1
            session.steps[session.current_step_index].status = "in_progress"
            return f"Step {completed} complete. Next: {session.steps[session.current_step_index].title}."
        session.status = "completed"
        session.completed_at = time.time()
        return "Runbook complete. Review remaining alerts before closing the incident."

    def complete_pending_step(self, action_id, result):
        if self.pending_action_id != action_id or not self.active_session:
            return
        self.pending_action_id = None
        self._finish_step(result)

    def advance_runbook(self, user_confirmed=False):
        from app.core.auth_rbac import security_manager, MUTATIONS
        from app.services.orchestrator import agent_orchestrator
        if not security_manager.is_action_permitted("advance_runbook"):
            return "Permission denied.", self.get_active_session(), []
        if not self.active_session or self.active_session.status != "active":
            return "No active runbook. Start one first.", self.get_active_session(), []
        step = self.active_session.steps[self.active_session.current_step_index]
        if step.action in MUTATIONS:
            if agent_orchestrator.staged_action:
                return "An action is awaiting approval. Confirm or cancel it first.", self.get_active_session(), []
            spoken, result = agent_orchestrator._stage_remediation(step.action, step.target_service, step.action_args)
            if result.get("status") == "staged":
                self.pending_action_id = result["id"]
            elif result.get("success"):
                spoken = self._finish_step(result)
            tools = [{"tool_name": "execute_remediation", "arguments": step.action_args, "result": result, "timestamp": time.time()}]
            return spoken, self.get_active_session(), tools
        result = agent_orchestrator.dispatch_tool(step.action, step.action_args) if step.action else {"success": True}
        tools = [{"tool_name": step.action, "arguments": step.action_args, "result": result, "timestamp": time.time()}] if step.action else []
        return self._finish_step(result), self.get_active_session(), tools

    def abort_runbook(self):
        from app.services.orchestrator import agent_orchestrator
        if self.pending_action_id:
            agent_orchestrator.cancel_staged_remediation(self.pending_action_id)
        self.pending_action_id = None
        if self.active_session:
            self.active_session.status = "aborted"
        return "Runbook aborted.", self.get_active_session()

from app.core.session import SessionLocal
runbook_engine = SessionLocal("runbook", RunbookEngine)

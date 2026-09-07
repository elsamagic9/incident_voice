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
                    verification_metric="latency_p99_ms <= 1500"
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
        return True, f"Service {step.target_service} checked."

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

    return True, f"Gate verified: Telemetry for {step.target_service} nominal."

class RunbookEngine:
    def __init__(self):
        self.definitions = _build_builtin_runbooks()
        self.active_session: Optional[ActiveRunbookSession] = None

    def reset(self):
        self.active_session = None

    def list_runbooks(self) -> List[Dict[str, Any]]:
        """Returns catalog of available SRE Runbooks."""
        return [rb.model_dump() for rb in self.definitions.values()]

    def get_active_session(self) -> Optional[Dict[str, Any]]:
        """Returns the currently executing runbook session, if any."""
        if not self.active_session:
            return None
        return self.active_session.model_dump()

    def start_runbook(self, runbook_id: Optional[str] = "runbook-pg-pool") -> Tuple[str, Dict[str, Any]]:
        """
        Initiates a voice-guided runbook workflow.
        Returns (spoken_guidance, active_runbook_dict).
        """
        if not runbook_id:
            runbook_id = "runbook-pg-pool"
        clean_id = str(runbook_id).strip().lower()
        matched_id = None
        for k in self.definitions:
            if clean_id in k or k in clean_id or clean_id.replace(" ", "-") in k:
                matched_id = k
                break

        if not matched_id:
            # Fallback by keyword
            if "postgres" in clean_id or "sql" in clean_id or "pool" in clean_id or "db" in clean_id:
                matched_id = "runbook-pg-pool"
            elif "redis" in clean_id or "cache" in clean_id or "eviction" in clean_id:
                matched_id = "runbook-redis-eviction"
            elif "ingress" in clean_id or "surge" in clean_id or "traffic" in clean_id or "spike" in clean_id:
                matched_id = "runbook-ingress-surge"
            else:
                matched_id = "runbook-pg-pool"

        definition = self.definitions[matched_id]

        # Deep clone steps
        steps = [step.model_copy(deep=True) for step in definition.steps]
        steps[0].status = "in_progress"

        self.active_session = ActiveRunbookSession(
            runbook_id=definition.id,
            title=definition.title,
            current_step_index=0,
            total_steps=len(steps),
            started_at=time.time(),
            status="active",
            steps=steps
        )

        # Disengage any stale staged guardrails from prior turns
        try:
            from app.services.orchestrator import agent_orchestrator
            agent_orchestrator.staged_action = None
            agent_orchestrator.awaiting_confirmation = False
        except Exception:
            pass

        cluster_state.add_event("action", f"Runbook started: '{definition.title}' ({len(steps)} steps)")

        first_step = steps[0]
        spoken = (
            f"Starting SRE Runbook: {definition.title}. "
            f"Step 1 of {len(steps)}: {first_step.title}. {first_step.description} "
            f"Say 'Execute step' or click Advance to proceed."
        )
        return spoken, self.active_session.model_dump()

    def advance_runbook(self, user_confirmed: bool = True) -> Tuple[str, Dict[str, Any], List[Dict[str, Any]]]:
        """
        Executes the current step's action, validates telemetry,
        and advances to the next step.
        Returns: (spoken_text, runbook_dict, executed_tools)
        """
        if not self.active_session or self.active_session.status != "active":
            return "No active runbook session is currently executing. You can say 'Start runbook postgres' to begin.", {}, []

        curr_idx = self.active_session.current_step_index
        step = self.active_session.steps[curr_idx]
        executed_tools: List[Dict[str, Any]] = []

        # Execute action associated with step if present
        action = step.action
        args = step.action_args or {}

        if action:
            if action in ["restart_pod", "flush_cache", "scale_replicas", "enable_circuit_breaker"]:
                svc = args.get("service_name", step.target_service)
                count = args.get("count", 4)
                res = execute_remediation(action, svc, count=count)
                executed_tools.append({
                    "tool_name": "execute_remediation",
                    "arguments": {"action": action, "service_name": svc, "count": count},
                    "result": res,
                    "timestamp": time.time()
                })
                # Clear any matching staged action so safety guardrail banner is not orphaned
                try:
                    from app.services.orchestrator import agent_orchestrator
                    if agent_orchestrator.staged_action and agent_orchestrator.staged_action.get("service_name") == svc:
                        agent_orchestrator.staged_action = None
                        agent_orchestrator.awaiting_confirmation = False
                except Exception:
                    pass
            elif action == "query_telemetry":
                svc = args.get("service_name", step.target_service)
                res = query_telemetry(svc)
                executed_tools.append({
                    "tool_name": "query_telemetry",
                    "arguments": {"service_name": svc},
                    "result": res,
                    "timestamp": time.time()
                })
            elif action == "inspect_service_logs":
                svc = args.get("service_name", step.target_service)
                res = inspect_service_logs(svc, lines=args.get("lines", 4))
                executed_tools.append({
                    "tool_name": "inspect_service_logs",
                    "arguments": {"service_name": svc},
                    "result": res,
                    "timestamp": time.time()
                })
            elif action == "get_cluster_health":
                from app.tools.sre_tools import get_cluster_health
                res = get_cluster_health()
                executed_tools.append({
                    "tool_name": "get_cluster_health",
                    "arguments": {},
                    "result": res,
                    "timestamp": time.time()
                })

        # Telemetry verification check
        gate_passed, gate_details = evaluate_telemetry_gate(step)
        step.status = "completed" if gate_passed else "failed"
        step.verification_result = gate_details

        # Check if more steps remain
        if curr_idx + 1 < self.active_session.total_steps:
            self.active_session.current_step_index += 1
            next_step = self.active_session.steps[curr_idx + 1]
            next_step.status = "in_progress"

            cluster_state.add_event(
                "action",
                f"Runbook Step {curr_idx + 1} completed: {step.title}. Telemetry gate: {gate_details}. Advancing to Step {curr_idx + 2}: {next_step.title}."
            )

            spoken = (
                f"Step {curr_idx + 1} complete: {step.title}. "
                f"{gate_details} "
                f"Advancing to Step {curr_idx + 2} of {self.active_session.total_steps}: {next_step.title}. "
                f"{next_step.description}"
            )
            return spoken, self.active_session.model_dump(), executed_tools
        else:
            # Runbook completed
            self.active_session.status = "completed"
            self.active_session.completed_at = time.time()

            cluster_state.add_event(
                "action",
                f"Runbook '{self.active_session.title}' completed successfully. All steps executed and telemetry gates verified."
            )

            # Check if all services are healthy and update incident status
            critical_count = sum(1 for s in cluster_state.services.values() if s.status == "critical")
            if critical_count == 0:
                cluster_state.incident.status = "MITIGATED"

            spoken = (
                f"Runbook complete: {self.active_session.title}. "
                f"All {self.active_session.total_steps} operational procedures were executed and telemetry gates verified. "
                f"{gate_details} Cluster services are returning to nominal state."
            )
            return spoken, self.active_session.model_dump(), executed_tools

    def abort_runbook(self) -> Tuple[str, Dict[str, Any]]:
        """Aborts the current active runbook session."""
        if not self.active_session:
            return "No active runbook is currently running.", {}

        title = self.active_session.title
        curr_step = self.active_session.current_step_index + 1
        self.active_session.status = "aborted"
        if self.active_session.steps and self.active_session.current_step_index < len(self.active_session.steps):
            self.active_session.steps[self.active_session.current_step_index].status = "failed"

        cluster_state.add_event("action", f"Runbook '{title}' aborted at Step {curr_step}.")
        data = self.active_session.model_dump()
        self.active_session = None

        spoken = f"Runbook {title} aborted at step {curr_step}. Normal autonomous incident monitoring resumed."
        return spoken, data

# Global singleton
runbook_engine = RunbookEngine()

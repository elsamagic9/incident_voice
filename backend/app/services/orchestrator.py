import json
import logging
import time
from typing import Dict, Any, List, Optional, Tuple
import httpx
from app.core.config import settings
from app.core.state import cluster_state
from app.tools.sre_tools import SRE_TOOL_MAP, get_cluster_health, execute_remediation
from app.tools.tool_schemas import SRE_TOOL_DEFINITIONS
from app.services.lemur_service import lemur_service

logger = logging.getLogger("agent_orchestrator")

SYSTEM_PROMPT = """You are IncidentVoice, an elite Autonomous Voice Site Reliability Engineer (SRE) and Incident Commander.
You assist human on-call engineers during live production outages using low-latency voice interaction.

Tone and Rules:
1. Voice-First Brevity: Speak concisely in 1 to 2 clear, authoritative sentences. Never read out full stack traces or long JSON payloads; summarize the key takeaway (e.g. "Payment service is failing with 42% 503 errors due to DB connection pool starvation. I recommend scaling replicas or restarting pods.").
2. Proactive Remediation: When an engineer asks you to investigate or fix an issue, call the appropriate tools (e.g., inspect_service_logs, execute_remediation, trigger_pager).
3. Post-Incident Review: When the engineer signals the incident is resolved or requests a post-mortem, invoke the postmortem workflow.
4. Professional SRE Vocabulary: Use standard terminology (P99 latency, RPS, pod crashloop, connection starvation, circuit breaker).
5. Safety Guardrails: Destructive remediations (restart_pod, flush_cache, rollback_release) require staging and explicit confirmation.
"""

DESTRUCTIVE_ACTIONS = {"restart_pod", "flush_cache", "rollback_release", "restart"}

class AgentOrchestrator:
    def __init__(self):
        self.history: List[Dict[str, str]] = []
        self.staged_action: Optional[Dict[str, Any]] = None
        self.awaiting_confirmation: bool = False

    def reset(self):
        self.history = []
        self.staged_action = None
        self.awaiting_confirmation = False
        cluster_state.reset_to_default_incident()
        try:
            from app.services.runbook_engine import runbook_engine
            runbook_engine.reset()
            from app.services.blackbox_service import blackbox_service
            blackbox_service.reset()
        except Exception:
            pass

    def confirm_staged_remediation(self) -> Tuple[str, List[Dict[str, Any]]]:
        """Directly executes the currently staged remediation (e.g. via UI Authorize button)."""
        if not self.staged_action:
            return "No remediation is currently staged.", []

        action = self.staged_action["action"]
        service_name = self.staged_action["service_name"]
        params = self.staged_action.get("params", {})
        count = params.get("count", 5)

        res = execute_remediation(action, service_name, count=count)
        executed_tool = {
            "tool_name": "execute_remediation",
            "arguments": {"action": action, "service_name": service_name, "count": count},
            "result": res,
            "timestamp": time.time()
        }

        self.staged_action = None
        self.awaiting_confirmation = False

        if action in ["restart_pod", "restart"]:
            spoken_text = f"Confirmed. Graceful rolling restart executed for {service_name}. Healthy replacement pods are now passing readiness probes."
        elif action == "flush_cache":
            spoken_text = "Confirmed. Redis cache memory cleared and connection pool recycled. Memory utilization dropped to 35%."
        elif action == "rollback_release":
            spoken_text = f"Confirmed. Deployment for {service_name} rolled back to previous stable release."
        else:
            spoken_text = f"Confirmed. Remediation {action} executed successfully for {service_name}."

        self.history.append({"speaker": "agent", "transcript": spoken_text})
        cluster_state.add_event("voice", f"IncidentVoice: \"{spoken_text}\"")
        return spoken_text, [executed_tool]

    def cancel_staged_remediation(self) -> str:
        """Cancels any currently staged remediation."""
        self.staged_action = None
        self.awaiting_confirmation = False
        spoken_text = "Remediation cancelled. No changes were applied to the cluster."
        self.history.append({"speaker": "agent", "transcript": spoken_text})
        cluster_state.add_event("voice", f"IncidentVoice: \"{spoken_text}\"")
        return spoken_text

    def _stage_remediation(self, action: str, service_name: str, params: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        """Stages a destructive remediation and prompts for confirmation."""
        self.staged_action = {
            "action": action,
            "service_name": service_name,
            "params": params,
            "staged_at": time.time()
        }
        self.awaiting_confirmation = True

        if action in ["restart_pod", "restart"]:
            action_label = "Rolling restart"
        elif action == "flush_cache":
            action_label = "Cache flush"
        elif action == "rollback_release":
            action_label = "Rollback release"
        else:
            action_label = action.replace("_", " ").title()

        spoken_prompt = f"Remediation staged: {action_label} of {service_name}. Say 'Confirm' or click Authorize to execute."
        staged_result = {
            "status": "staged",
            "awaiting_confirmation": True,
            "action": action,
            "service_name": service_name,
            "message": spoken_prompt
        }
        return spoken_prompt, staged_result

    async def process_user_turn(self, user_transcript: str) -> Tuple[str, List[Dict[str, Any]], Optional[Dict[str, Any]]]:
        """
        Processes an endpointed user utterance.
        Returns:
            (spoken_response_text, list_of_executed_tool_events, postmortem_data_or_None)
        """
        user_transcript = user_transcript.strip()
        self.history.append({"speaker": "user", "transcript": user_transcript})
        cluster_state.add_event("voice", f"Engineer: \"{user_transcript}\"")
        try:
            from app.services.blackbox_service import blackbox_service
            blackbox_service.record_event("user", user_transcript, "voice")
        except Exception:
            pass

        executed_tools: List[Dict[str, Any]] = []
        postmortem_result: Optional[Dict[str, Any]] = None
        lower = user_transcript.lower()

        # 1. Handle confirmation / cancellation of staged remediation
        is_runbook_cmd = any(k in lower for k in ["runbook", "step"])
        if self.awaiting_confirmation and self.staged_action and not is_runbook_cmd:
            staged_at = self.staged_action.get("staged_at", 0)
            if time.time() - staged_at > 30.0:
                logger.info("Staged remediation timed out after 30s. Disengaging lock.")
                self.staged_action = None
                self.awaiting_confirmation = False
            else:
                confirm_words = ["confirm", "authorize", "execute", "yes", "proceed", "go ahead", "do it", "approved", "confirmed"]
                cancel_words = ["cancel", "abort", "no", "stop", "dismiss", "negative", "don't"]

                if any(w in lower for w in confirm_words):
                    spoken_text, tools = self.confirm_staged_remediation()
                    try:
                        from app.services.blackbox_service import blackbox_service
                        blackbox_service.record_event("agent", spoken_text, "remediation")
                    except Exception:
                        pass
                    return spoken_text, tools, None
                elif any(w in lower for w in cancel_words):
                    spoken_text = self.cancel_staged_remediation()
                    try:
                        from app.services.blackbox_service import blackbox_service
                        blackbox_service.record_event("agent", spoken_text, "voice")
                    except Exception:
                        pass
                    return spoken_text, [], None

        # 2. Check for Post-Mortem trigger
        if any(k in lower for k in ["post-mortem", "postmortem", "wrap up", "incident resolved", "generate report", "incident review"]):
            logger.info("Triggering AssemblyAI LeMUR Post-Mortem synthesis.")
            postmortem_result = await lemur_service.generate_postmortem(
                transcript_history=self.history,
                timeline_events=cluster_state.incident.timeline_events,
                incident_id=cluster_state.incident.id
            )
            cluster_state.add_event("system", "AssemblyAI LeMUR generated certified Post-Mortem Report.")
            spoken_text = "Incident review complete. I have synthesized the root cause, timeline, and action items via AssemblyAI LeMUR. The report is ready on your mission control console."
            self.history.append({"speaker": "agent", "transcript": spoken_text})
            cluster_state.add_event("voice", f"IncidentVoice: \"{spoken_text}\"")
            try:
                from app.services.blackbox_service import blackbox_service
                blackbox_service.record_event("agent", spoken_text, "voice")
            except Exception:
                pass
            return spoken_text, executed_tools, postmortem_result

        # 3. Dynamic Function Calling with LLM (Gemini 2.0 Flash / OpenAI)
        if (settings.gemini_api_key and settings.llm_provider == "gemini") or \
           (settings.openai_api_key and settings.llm_provider == "openai"):
            try:
                spoken_text, tools = await self._call_dynamic_llm(user_transcript)
                executed_tools.extend(tools)
                self.history.append({"speaker": "agent", "transcript": spoken_text})
                cluster_state.add_event("voice", f"IncidentVoice: \"{spoken_text}\"")
                try:
                    from app.services.blackbox_service import blackbox_service
                    blackbox_service.record_event("agent", spoken_text, "voice")
                except Exception:
                    pass
                return spoken_text, executed_tools, None
            except Exception as e:
                logger.error(f"LLM function calling error, falling back to deterministic fast engine: {e}")

        # 4. Deterministic Fast Intelligence Engine (guaranteed zero latency and offline capability)
        spoken_text, tools = self._deterministic_agent_reasoning(user_transcript)
        executed_tools.extend(tools)
        self.history.append({"speaker": "agent", "transcript": spoken_text})
        cluster_state.add_event("voice", f"IncidentVoice: \"{spoken_text}\"")
        try:
            from app.services.blackbox_service import blackbox_service
            blackbox_service.record_event("agent", spoken_text, "voice")
        except Exception:
            pass
        return spoken_text, executed_tools, None

    def _deterministic_agent_reasoning(self, text: str) -> Tuple[str, List[Dict[str, Any]]]:
        lower = text.lower()
        tools = []

        # 1. Health / Status Query
        if any(w in lower for w in ["health", "status", "alerts", "what's failing", "overview", "what is wrong", "situation"]):
            res = SRE_TOOL_MAP["get_cluster_health"]()
            tools.append({
                "tool_name": "get_cluster_health",
                "arguments": {},
                "result": res,
                "timestamp": time.time()
            })
            crit = [s["name"] for s in res["critical_services"]]
            if crit:
                return (
                    f"Warning: Critical alerts active on {', '.join(crit)}. "
                    f"Payment Processing is failing with 42% 503 errors and DB connection starvation.",
                    tools
                )
            return "All cluster microservices are currently operating within nominal parameters.", tools

        # 2. Inspect Logs
        elif any(w in lower for w in ["log", "logs", "trace", "error trace", "stack trace", "why is it failing"]):
            svc_target = "payment-service"
            for k in cluster_state.services:
                if k in lower or k.replace("-", " ") in lower:
                    svc_target = k
                    break

            res = SRE_TOOL_MAP["inspect_service_logs"](svc_target)
            tools.append({
                "tool_name": "inspect_service_logs",
                "arguments": {"service_name": svc_target, "lines": 4},
                "result": res,
                "timestamp": time.time()
            })
            log_entries = res.get("logs", [])
            last_log = log_entries[-1] if log_entries else "No recent log entries"
            clean_log = last_log.replace("[WARN]", "").replace("[ERROR]", "").replace("[FATAL]", "").replace("[INFO]", "").strip()
            return (
                f"Logs for {svc_target} show: {clean_log}.",
                tools
            )

        # 3. Scaling Replicas (Non-destructive)
        elif any(w in lower for w in ["scale", "replicas", "more pods"]):
            svc_target = "payment-service"
            for k in cluster_state.services:
                if k in lower:
                    svc_target = k
                    break
            import re
            m = re.search(r'\b(\d+)\b', text)
            target_count = int(m.group(1)) if m else 5
            res = SRE_TOOL_MAP["execute_remediation"]("scale_replicas", svc_target, target_count)
            tools.append({
                "tool_name": "execute_remediation",
                "arguments": {"action": "scale_replicas", "service_name": svc_target, "count": target_count},
                "result": res,
                "timestamp": time.time()
            })
            return f"Scaled {svc_target} to {target_count} replicas. New worker pods are now initializing in Kubernetes.", tools

        # 4. Restart / Rollback / Cache Flush (Destructive: Guardrail staging applied)
        elif any(w in lower for w in ["restart", "reboot", "bounce", "cycle"]):
            svc_target = "payment-service"
            for k in cluster_state.services:
                if k in lower:
                    svc_target = k
                    break

            prompt, staged_res = self._stage_remediation("restart_pod", svc_target, {})
            tools.append({
                "tool_name": "execute_remediation",
                "arguments": {"action": "restart_pod", "service_name": svc_target},
                "result": staged_res,
                "timestamp": time.time()
            })
            return prompt, tools

        elif any(w in lower for w in ["flush", "redis", "cache"]):
            prompt, staged_res = self._stage_remediation("flush_cache", "redis-cache", {})
            tools.append({
                "tool_name": "execute_remediation",
                "arguments": {"action": "flush_cache", "service_name": "redis-cache"},
                "result": staged_res,
                "timestamp": time.time()
            })
            return prompt, tools

        elif any(w in lower for w in ["rollback", "revert"]):
            svc_target = "payment-service"
            for k in cluster_state.services:
                if k in lower:
                    svc_target = k
                    break
            prompt, staged_res = self._stage_remediation("rollback_release", svc_target, {})
            tools.append({
                "tool_name": "execute_remediation",
                "arguments": {"action": "rollback_release", "service_name": svc_target},
                "result": staged_res,
                "timestamp": time.time()
            })
            return prompt, tools

        elif any(w in lower for w in ["circuit breaker", "isolate", "throttle"]):
            res = SRE_TOOL_MAP["execute_remediation"]("enable_circuit_breaker", "payment-service")
            tools.append({
                "tool_name": "execute_remediation",
                "arguments": {"action": "enable_circuit_breaker", "service_name": "payment-service"},
                "result": res,
                "timestamp": time.time()
            })
            return "Ingress circuit breaker tripped for payment service. Downstream traffic has been throttled to protect database stability.", tools

        elif any(w in lower for w in ["page", "call", "escalate"]):
            res = SRE_TOOL_MAP["trigger_pager"]("database-team", "Sev-1 connection starvation in payment pipeline")
            tools.append({
                "tool_name": "trigger_pager",
                "arguments": {"team": "database-team", "message": "Sev-1 connection starvation in payment pipeline"},
                "result": res,
                "timestamp": time.time()
            })
            return "PagerDuty alert dispatched to the Database Infrastructure on-call lead.", tools

        # 5. Host Metrics & Top Processes
        elif any(w in lower for w in ["host", "server load", "system load", "cpu usage", "top process", "processes"]):
            res = SRE_TOOL_MAP["query_host_telemetry"]()
            tools.append({
                "tool_name": "query_host_telemetry",
                "arguments": {},
                "result": res,
                "timestamp": time.time()
            })
            metrics = res.get("host_metrics", {})
            cpu = metrics.get("host_cpu_percent", 0)
            mem = metrics.get("host_memory_percent", 0)
            load = metrics.get("load_averages", [0, 0, 0])[0]
            top_p = res.get("top_processes", [])
            top_name = top_p[0]["name"] if top_p else "system"
            return (
                f"Host operating system is running at {cpu}% CPU utilization, {mem}% RAM used, and load average {load}. "
                f"Top process is {top_name}.",
                tools
            )

        # 6. SRE Chaos Injection & Demo Scenarios
        elif any(w in lower for w in ["simulate", "chaos", "crash", "starve", "restore all", "nominal health"]):
            if any(w in lower for w in ["heal", "restore", "nominal"]):
                res = cluster_state.simulate_scenario("heal_all")
                return "All cluster microservices restored to nominal healthy state. Incident resolved.", tools
            elif any(w in lower for w in ["starve", "database", "order db", "connection pool"]):
                res = cluster_state.simulate_scenario("starve_db")
                return "Simulated database connection pool exhaustion on order-db. Max connections reached at 200 client handles.", tools
            elif any(w in lower for w in ["spike", "traffic", "ingress"]):
                res = cluster_state.simulate_scenario("traffic_spike")
                return "Simulated 10k RPS traffic surge on ingress gateway. Downstream error rates elevated.", tools
            elif any(w in lower for w in ["crash", "payment", "p1 outage", "503"]):
                res = cluster_state.simulate_scenario("crash_payment")
                return "Simulated Sev-1 crash injected on payment-service. Error rate spiked to 42.6% with pod crashloop.", tools

        # 7. SRE Runbook Workflow Engine
        elif any(w in lower for w in ["runbook", "standard operating procedure", "sop"]):
            if any(w in lower for w in ["list", "available", "what runbooks", "catalog", "options"]):
                res = SRE_TOOL_MAP["list_runbooks"]()
                tools.append({
                    "tool_name": "list_runbooks",
                    "arguments": {},
                    "result": res,
                    "timestamp": time.time()
                })
                titles = [rb["title"] for rb in res.get("runbooks", [])]
                return f"Available SRE Runbooks: {'; '.join(titles)}. Say 'Start runbook postgres' or 'Start runbook redis' to begin.", tools

            elif any(w in lower for w in ["abort", "cancel", "stop"]):
                res = SRE_TOOL_MAP["abort_runbook"]()
                tools.append({
                    "tool_name": "abort_runbook",
                    "arguments": {},
                    "result": res,
                    "timestamp": time.time()
                })
                return res.get("spoken", "Runbook aborted."), tools

            elif any(w in lower for w in ["advance", "next", "continue", "proceed"]) or ("execute" in lower and "step" in lower):
                res = SRE_TOOL_MAP["advance_runbook"]()
                tools.append({
                    "tool_name": "advance_runbook",
                    "arguments": {},
                    "result": res,
                    "timestamp": time.time()
                })
                if res.get("executed_tools"):
                    tools.extend(res["executed_tools"])
                return res.get("spoken", "Runbook step advanced."), tools

            else:
                res = SRE_TOOL_MAP["start_runbook"](lower)
                tools.append({
                    "tool_name": "start_runbook",
                    "arguments": {"runbook_id": lower},
                    "result": res,
                    "timestamp": time.time()
                })
                return res.get("spoken", "Runbook started."), tools

        elif any(w in lower for w in ["next step", "advance step", "continue runbook", "execute step", "proceed with step", "next runbook step"]) or \
             (runbook_engine.active_session and runbook_engine.active_session.status == "active" and any(w in lower for w in ["next step", "execute step", "advance", "continue step"])):
            res = SRE_TOOL_MAP["advance_runbook"]()
            tools.append({
                "tool_name": "advance_runbook",
                "arguments": {},
                "result": res,
                "timestamp": time.time()
            })
            if res.get("executed_tools"):
                tools.extend(res["executed_tools"])
            return res.get("spoken", "Runbook step advanced."), tools

        # 8. Service Dependency Graph & Blast Radius
        elif any(w in lower for w in ["topology", "dependency graph", "blast radius", "dependencies", "service map"]):
            res = SRE_TOOL_MAP["get_service_topology"]()
            tools.append({
                "tool_name": "get_service_topology",
                "arguments": {},
                "result": res,
                "timestamp": time.time()
            })
            blast = res.get("blast_radius_service_ids", [])
            blast_txt = f"Active blast radius impacts {', '.join(blast)}." if blast else "No cascading blast radius detected."
            return f"Service dependency topology analyzed. Ingress gateway routes to Payment Service and Auth. {blast_txt}", tools

        # Default SRE response
        return (
            f"Acknowledged. I'm monitoring the cluster. Payment service is degraded. "
            f"You can command me to inspect logs, scale replicas, flush Redis, or restart failing pods.",
            tools
        )

    async def _call_dynamic_llm(self, user_text: str) -> Tuple[str, List[Dict[str, Any]]]:
        """Dispatches dynamic function calling to configured LLM provider."""
        if settings.llm_provider == "openai" and settings.openai_api_key:
            return await self._call_openai(user_text)
        return await self._call_gemini(user_text)

    async def _call_gemini(self, user_text: str) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Executes dynamic function-calling loop with Gemini 2.0 Flash:
        1. Formats SRE_TOOL_DEFINITIONS into Gemini functionDeclarations
        2. Inspects model candidate for functionCall
        3. Enforces Two-Phase SRE Safety Guardrails for destructive tools
        4. Injects tool results back into contents for the final voice response
        """
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={settings.gemini_api_key}"

        gemini_tools = [{
            "functionDeclarations": [
                {
                    "name": tool["function"]["name"],
                    "description": tool["function"]["description"],
                    "parameters": tool["function"]["parameters"]
                }
                for tool in SRE_TOOL_DEFINITIONS
            ]
        }]

        contents: List[Dict[str, Any]] = [
            {
                "role": "user",
                "parts": [{"text": f"System context:\n{SYSTEM_PROMPT}"}]
            },
            {
                "role": "model",
                "parts": [{"text": "Understood. Autonomous Incident Commander ready."}]
            }
        ]

        # Multi-turn conversational context
        for turn in self.history[-6:-1]:
            role = "user" if turn.get("speaker") == "user" else "model"
            contents.append({
                "role": role,
                "parts": [{"text": turn.get("transcript", "")}]
            })

        contents.append({
            "role": "user",
            "parts": [{"text": user_text}]
        })

        executed_tools: List[Dict[str, Any]] = []

        async with httpx.AsyncClient(timeout=20.0) as client:
            for _ in range(3):  # Allow up to 3 function call hops
                payload = {
                    "contents": contents,
                    "tools": gemini_tools,
                    "generationConfig": {
                        "temperature": 0.2,
                        "maxOutputTokens": 300
                    }
                }
                resp = await client.post(url, json=payload)
                if resp.status_code != 200:
                    raise Exception(f"Gemini API returned status {resp.status_code}: {resp.text}")

                data = resp.json()
                candidate = data.get("candidates", [{}])[0].get("content", {})
                parts = candidate.get("parts", [])

                function_call_part = next((p for p in parts if "functionCall" in p), None)

                if function_call_part:
                    fn_call = function_call_part["functionCall"]
                    fn_name = fn_call.get("name")
                    fn_args = fn_call.get("args", {})

                    logger.info(f"Gemini 2.0 Flash invoked tool '{fn_name}' with args {fn_args}")

                    # Two-Phase Safety Guardrail Check
                    if fn_name == "execute_remediation":
                        action = fn_args.get("action", "")
                        svc = fn_args.get("service_name", "payment-service")
                        if action in DESTRUCTIVE_ACTIONS:
                            prompt, staged_res = self._stage_remediation(action, svc, fn_args)
                            executed_tools.append({
                                "tool_name": fn_name,
                                "arguments": fn_args,
                                "result": staged_res,
                                "timestamp": time.time()
                            })
                            return prompt, executed_tools

                    # Execute tool
                    tool_fn = SRE_TOOL_MAP.get(fn_name)
                    if tool_fn:
                        try:
                            result = tool_fn(**fn_args)
                        except TypeError:
                            result = tool_fn()
                    else:
                        result = {"error": f"Unknown tool '{fn_name}'"}

                    executed_tools.append({
                        "tool_name": fn_name,
                        "arguments": fn_args,
                        "result": result,
                        "timestamp": time.time()
                    })

                    # Feed function response back to Gemini
                    contents.append({
                        "role": "model",
                        "parts": [function_call_part]
                    })
                    contents.append({
                        "role": "user",
                        "parts": [{
                            "functionResponse": {
                                "name": fn_name,
                                "response": {"name": fn_name, "content": result}
                            }
                        }]
                    })
                else:
                    # Final textual voice response
                    text_parts = [p.get("text", "") for p in parts if "text" in p]
                    final_text = " ".join(text_parts).strip()
                    return final_text or "Acknowledged. Cluster status monitored.", executed_tools

        return "Remediation analysis complete.", executed_tools

    async def _call_openai(self, user_text: str) -> Tuple[str, List[Dict[str, Any]]]:
        """Executes dynamic function-calling loop with OpenAI format."""
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json"
        }

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ]
        for turn in self.history[-6:-1]:
            role = "user" if turn.get("speaker") == "user" else "assistant"
            messages.append({"role": role, "content": turn.get("transcript", "")})
        messages.append({"role": "user", "content": user_text})
        executed_tools: List[Dict[str, Any]] = []

        async with httpx.AsyncClient(timeout=20.0) as client:
            for _ in range(3):
                payload = {
                    "model": "gpt-4o-mini",
                    "messages": messages,
                    "tools": SRE_TOOL_DEFINITIONS,
                    "temperature": 0.2,
                    "max_tokens": 300
                }
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code != 200:
                    raise Exception(f"OpenAI API returned status {resp.status_code}: {resp.text}")

                msg = resp.json()["choices"][0]["message"]
                if msg.get("tool_calls"):
                    messages.append(msg)
                    for tc in msg["tool_calls"]:
                        fn_name = tc["function"]["name"]
                        fn_args = json.loads(tc["function"].get("arguments", "{}"))

                        if fn_name == "execute_remediation":
                            action = fn_args.get("action", "")
                            svc = fn_args.get("service_name", "payment-service")
                            if action in DESTRUCTIVE_ACTIONS:
                                prompt, staged_res = self._stage_remediation(action, svc, fn_args)
                                executed_tools.append({
                                    "tool_name": fn_name,
                                    "arguments": fn_args,
                                    "result": staged_res,
                                    "timestamp": time.time()
                                })
                                return prompt, executed_tools

                        tool_fn = SRE_TOOL_MAP.get(fn_name)
                        if tool_fn:
                            try:
                                result = tool_fn(**fn_args)
                            except TypeError:
                                result = tool_fn()
                            except Exception as e:
                                result = {"error": str(e)}
                        else:
                            result = {"error": f"Unknown tool {fn_name}"}

                        executed_tools.append({
                            "tool_name": fn_name,
                            "arguments": fn_args,
                            "result": result,
                            "timestamp": time.time()
                        })
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": json.dumps(result)
                        })
                else:
                    return msg.get("content", "").strip(), executed_tools

        return "Analysis complete.", executed_tools

agent_orchestrator = AgentOrchestrator()

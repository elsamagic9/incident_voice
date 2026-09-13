"""
IncidentVoice 500-Prompt Comprehensive Dogfooding & Stress Harness.
Executes 500 realistic, diverse, and adversarial operator prompts one by one,
checks each response, detects errors, and logs detailed diagnostics.
"""

import asyncio
import os
import re
import sys
import time
from typing import List, Dict, Any, Tuple

# Ensure backend directory is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Build the 500-prompt catalog
PROMPTS: List[Dict[str, Any]] = [
    # --- Category 1: Cluster Health & Golden Signals (40 prompts) ---
    {"text": "Jarvis, check cluster health", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "What is the status of the cluster?", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Give me a cluster overview", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Are there any active alerts?", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Is any service currently failing?", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Check health of all microservices", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "How is the infrastructure doing right now?", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Show me critical services in the cluster", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "What services are degraded?", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Check cluster vitals overview", "category": "health", "expect_tool": ["get_cluster_health", "query_telemetry"]},
    {"text": "Query telemetry for payment-service", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "What is the CPU usage on payment-service?", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "Check memory consumption for order-db", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "What are the four golden signals for payment-service?", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "Show latency metrics on ingress-gateway", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "What is the error rate for payment-service?", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "Check p99 latency for order-db", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "Query telemetry on redis-cache", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "Check memory saturation on redis", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "Is ingress-gateway experiencing high latency?", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "Show golden signals for order-db", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "What is the request throughput on ingress?", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "Check system metrics for payment", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "How is CPU looking on redis-cache?", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "Are there connection pool metrics on order-db?", "category": "telemetry", "expect_tool": ["query_telemetry", "inspect_service_logs"]},
    {"text": "Check error rate across payment pods", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "Telemetry check for ingress gateway", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "What is the p50 and p99 latency on payment?", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "Show telemetry report for database", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "Check active alerts and failing nodes", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Are we breaching any SLOs right now?", "category": "health", "expect_tool": ["get_cluster_health", "query_telemetry"]},
    {"text": "Is payment-service meeting its SLA?", "category": "telemetry", "expect_tool": "query_telemetry"},
    {"text": "Cluster health summary please", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Show me the health status of order-db", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Check cluster health and alert levels", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Are all 4 services healthy?", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Current status of microservices", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Cluster overview and alerts", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Tell me if anything is red in the cluster", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Give me the golden signals breakdown", "category": "telemetry", "expect_tool": "query_telemetry"},

    # --- Category 2: Investigation & Triage (40 prompts) ---
    {"text": "Jarvis, investigate incident", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Investigate the incident right now", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Diagnose the incident", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Diagnose what is going wrong with the system", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "What is causing payment-service to crash?", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "What caused the sudden spike in latency?", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Give me an incident brief", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "What is wrong with the cluster?", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Why is it slow?", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "What is the issue affecting our users?", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Perform a diagnostic triage on the cluster", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "What should we do to fix this incident?", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Run full investigation across all services", "category": "investigation", "expect_tool": ["investigate_incident", "get_cluster_health"]},
    {"text": "Why are transactions failing in payment-service?", "category": "investigation", "expect_tool": ["investigate_incident", "inspect_service_logs"]},
    {"text": "Investigate why order-db is saturated", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Triage the current sev-1 outage", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "What is causing backpressure on ingress?", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Start incident triage procedure", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "What does the diagnostic analysis reveal?", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Investigate root cause anomalies", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Why did the error rate jump to 12 percent?", "category": "investigation", "expect_tool": ["investigate_incident", "inspect_service_logs"]},
    {"text": "Diagnose the connection timeouts", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Inspect incident evidence and brief me", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "What triggered this outage?", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Investigate the cascade from database to payment", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Brief me on the active Sev-1 incident", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Why are API requests timing out at 5000ms?", "category": "investigation", "expect_tool": ["investigate_incident", "inspect_service_logs"]},
    {"text": "Diagnose service health degradation", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Run automated investigation workflow", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Investigate cluster-wide errors", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "What is the primary bottleneck right now?", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Identify what is degrading the payment flow", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Why is redis-cache showing high memory?", "category": "investigation", "expect_tool": ["investigate_incident", "inspect_service_logs"]},
    {"text": "What is causing the database queue buildup?", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Perform automated incident diagnostics", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Summarize the active incident state", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Why did latency spike on payment-service?", "category": "investigation", "expect_tool": ["investigate_incident", "inspect_service_logs"]},
    {"text": "Investigate the failure domain", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "What is causing cascading failures?", "category": "investigation", "expect_tool": "investigate_incident"},
    {"text": "Give me the root cause brief", "category": "investigation", "expect_tool": ["investigate_incident", "locate_causal_root_cause"]},

    # --- Category 3: Causal Root Cause Analysis (MicroHECL) (35 prompts) ---
    {"text": "Locate causal root cause", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Run causal root cause analysis", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "What is the root cause?", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Execute MicroHECL causal analysis", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Localize cause of this incident", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "What does causal analysis show?", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "MicroHECL causal localization", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Pinpoint the root cause service", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Find causal root cause in the topology", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Run causal engine on the dependency graph", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Where is the root cause originating?", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Causal analysis for order-db", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Determine causal upstream trigger", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "What is the root cause node?", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Calculate anomaly propagation scores with MicroHECL", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Run MicroHECL algorithm", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Localize root cause of latency surge", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Identify root cause component", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Analyze causal graph", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "What service has highest root cause probability?", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Locate source of cascading errors", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Find causal blame in topology", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Is order-db the root cause according to MicroHECL?", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Compute causal graph centrality", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Execute causal localization on cluster", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Where did the fault originate?", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Trace causal path from ingress to database", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Calculate root cause attribution", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "What is the causal verdict?", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Run causal discovery", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "MicroHECL localization check", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Check causal graph for payment-service", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Locate causal trigger of connection pool exhaust", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "What does the causal inference say?", "category": "causal", "expect_tool": "locate_causal_root_cause"},
    {"text": "Identify the causal root cause now", "category": "causal", "expect_tool": "locate_causal_root_cause"},

    # --- Category 4: DéjàVu Historical Incidents & Episodic Memory (35 prompts) ---
    {"text": "Match historical incident", "category": "dejavu", "expect_tool": "match_historical_incident"},
    {"text": "Run DéjàVu historical matching", "category": "dejavu", "expect_tool": "match_historical_incident"},
    {"text": "Have we seen a similar incident before?", "category": "dejavu", "expect_tool": "match_historical_incident"},
    {"text": "Is this a recurring incident?", "category": "dejavu", "expect_tool": "match_historical_incident"},
    {"text": "Find matching historical incidents", "category": "dejavu", "expect_tool": "match_historical_incident"},
    {"text": "DéjàVu incident match", "category": "dejavu", "expect_tool": "match_historical_incident"},
    {"text": "Compare against past incidents", "category": "dejavu", "expect_tool": ["match_historical_incident", "retrieve_incident_memory"]},
    {"text": "Has payment-service failed like this previously?", "category": "dejavu", "expect_tool": ["match_historical_incident", "get_cluster_health", "retrieve_incident_memory"]},
    {"text": "What is the historical similarity score?", "category": "dejavu", "expect_tool": "match_historical_incident"},
    {"text": "Match with historical runbooks", "category": "dejavu", "expect_tool": ["match_historical_incident", "start_runbook", "list_runbooks"]},
    {"text": "Retrieve incident memory for connection pool failure", "category": "memory", "expect_tool": "retrieve_incident_memory"},
    {"text": "Search incident memory for redis oom", "category": "memory", "expect_tool": "retrieve_incident_memory"},
    {"text": "What do you remember about previous outages?", "category": "memory", "expect_tool": "retrieve_incident_memory"},
    {"text": "Retrieve episodic memory for database timeout", "category": "memory", "expect_tool": "retrieve_incident_memory"},
    {"text": "Retrieve incident memory for high latency", "category": "memory", "expect_tool": "retrieve_incident_memory"},
    {"text": "Search past incidents about connection exhaustion", "category": "memory", "expect_tool": ["retrieve_incident_memory", "match_historical_incident"]},
    {"text": "Look up incident memory for ingress backpressure", "category": "memory", "expect_tool": "retrieve_incident_memory"},
    {"text": "What past incidents exist for payment-service?", "category": "memory", "expect_tool": ["retrieve_incident_memory", "match_historical_incident"]},
    {"text": "Query incident memory bank", "category": "memory", "expect_tool": "retrieve_incident_memory"},
    {"text": "Recall memories regarding memory leaks", "category": "memory", "expect_tool": ["retrieve_incident_memory", "query_telemetry"]},
    {"text": "Match current incident with DéjàVu database", "category": "dejavu", "expect_tool": "match_historical_incident"},
    {"text": "Did we have a recurring incident this month?", "category": "dejavu", "expect_tool": "match_historical_incident"},
    {"text": "Find similar past incidents in history", "category": "dejavu", "expect_tool": ["match_historical_incident", "retrieve_incident_memory"]},
    {"text": "What was the MTTR for similar past incidents?", "category": "dejavu", "expect_tool": ["match_historical_incident", "retrieve_incident_memory"]},
    {"text": "Retrieve memory for postgres connection spikes", "category": "memory", "expect_tool": "retrieve_incident_memory"},
    {"text": "What remediations worked on this incident previously?", "category": "dejavu", "expect_tool": "match_historical_incident"},
    {"text": "Check DéjàVu memory signatures", "category": "dejavu", "expect_tool": "match_historical_incident"},
    {"text": "Search episodic memory for cascading failure", "category": "memory", "expect_tool": "retrieve_incident_memory"},
    {"text": "Look up memory for circuit breaker trips", "category": "memory", "expect_tool": "retrieve_incident_memory"},
    {"text": "Retrieve incident memory for 502 bad gateway", "category": "memory", "expect_tool": "retrieve_incident_memory"},
    {"text": "Is this HIST-003 again?", "category": "dejavu", "expect_tool": "match_historical_incident"},
    {"text": "Match recurring incident patterns", "category": "dejavu", "expect_tool": "match_historical_incident"},
    {"text": "Query DéjàVu index", "category": "dejavu", "expect_tool": "match_historical_incident"},
    {"text": "Retrieve memory for slow database queries", "category": "memory", "expect_tool": "retrieve_incident_memory"},
    {"text": "Search past incidents for redis eviction", "category": "memory", "expect_tool": ["retrieve_incident_memory", "match_historical_incident"]},

    # --- Category 5: Tree of Thoughts & Mitigation Planning (35 prompts) ---
    {"text": "Plan mitigation tree", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Run Tree of Thoughts mitigation planner", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Simulate remediation sequence", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Generate Tree of Thoughts plan", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "What is the optimal mitigation tree?", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Explore mitigation trajectories with ToT", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Simulate plan for cluster recovery", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "What is the best two-step remediation plan?", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Run Tree of Thoughts world model", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Evaluate mitigation paths using Tree of Thoughts", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Plan mitigation steps for payment-service", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Simulate remediation options", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Calculate projected value scores with Tree of Thoughts", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Find lowest risk mitigation trajectory", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Tree of Thoughts planning engine", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Simulate mitigation tree branches", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "What steps will recover the cluster fastest?", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Evaluate risk of restarting payment pods in ToT", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Build mitigation decision tree", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Simulate mitigation outcome", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Compare mitigation plans in Tree of Thoughts", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "What is our best remediation sequence?", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Execute Tree of Thoughts search", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Simulate plan to alleviate database pressure", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Tree of Thoughts simulation for ingress gateway", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "What does the mitigation tree recommend?", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Calculate risk-benefit tradeoff in ToT", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Search for optimal recovery plan", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Tree of Thoughts evaluation", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Simulate mitigation paths for order-db", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Project SLO recovery probability with ToT", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "What is the rank 1 mitigation trajectory?", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Generate Tree of Thoughts rollback option", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Simulate plan to restore golden signals", "category": "tot", "expect_tool": "plan_mitigation_tree"},
    {"text": "Mitigation tree synthesis", "category": "tot", "expect_tool": "plan_mitigation_tree"},

    # --- Category 6: Remediation Actions & Two-Phase Guardrails (50 prompts) ---
    {"text": "Restart payment-service", "category": "remediation", "expect_staged": True},
    {"text": "Please restart payment-service", "category": "remediation", "expect_staged": True},
    {"text": "Scale payment-service to 3 replicas", "category": "remediation", "expect_staged": True},
    {"text": "Scale order-db to 5 replicas", "category": "remediation", "expect_staged": True},
    {"text": "Flush redis cache", "category": "remediation", "expect_staged": True},
    {"text": "Flush cache on redis-cache", "category": "remediation", "expect_staged": True},
    {"text": "Rollback payment-service release", "category": "remediation", "expect_staged": True},
    {"text": "Rollback release on payment-service", "category": "remediation", "expect_staged": True},
    {"text": "Enable circuit breaker on ingress-gateway", "category": "remediation", "expect_staged": True},
    {"text": "Failover traffic for ingress-gateway", "category": "remediation", "expect_staged": True},
    {"text": "Restart order-db", "category": "remediation", "expect_staged": True},
    {"text": "Restart redis-cache", "category": "remediation", "expect_staged": True},
    {"text": "Restart ingress-gateway", "category": "remediation", "expect_staged": True},
    {"text": "Scale ingress-gateway to 4 pods", "category": "remediation", "expect_staged": True},
    {"text": "Scale redis-cache to 2 pods", "category": "remediation", "expect_staged": True},
    {"text": "Confirm", "category": "guardrail"},
    {"text": "Authorize", "category": "guardrail"},
    {"text": "Cancel", "category": "guardrail"},
    {"text": "Discard staged change", "category": "guardrail"},
    {"text": "Reject the proposal", "category": "guardrail"},
    {"text": "Why should I restart payment-service?", "category": "clarification"},
    {"text": "What will happen if I flush redis?", "category": "clarification"},
    {"text": "Explain the rollback action", "category": "clarification"},
    {"text": "Describe the scale action", "category": "clarification"},
    {"text": "Restart payment and flush redis", "category": "clarification"},
    {"text": "Scale payment-service and order-db", "category": "clarification"},
    {"text": "Just restart it", "category": "clarification"},
    {"text": "Execute restart", "category": "clarification"},
    {"text": "Flush cache now", "category": "remediation", "expect_staged": True},
    {"text": "Trigger pod restart for payment", "category": "remediation", "expect_staged": True},
    {"text": "Rollback the bad commit on payment", "category": "remediation", "expect_staged": True},
    {"text": "Scale payment to 5 replicas immediately", "category": "remediation", "expect_staged": True},
    {"text": "Enable circuit breaker for ingress", "category": "remediation", "expect_staged": True},
    {"text": "Apply traffic failover on ingress-gateway", "category": "remediation", "expect_staged": True},
    {"text": "Stage a restart on payment-service", "category": "remediation", "expect_staged": True},
    {"text": "Stage cache flush for redis", "category": "remediation", "expect_staged": True},
    {"text": "Can you restart payment-service?", "category": "remediation", "expect_staged": True},
    {"text": "I authorize the restart", "category": "guardrail"},
    {"text": "Do not execute that", "category": "guardrail"},
    {"text": "Abort the staged remediation", "category": "guardrail"},
    {"text": "Roll back payment-service", "category": "remediation", "expect_staged": True},
    {"text": "Scale database to 4 replicas", "category": "remediation", "expect_staged": True},
    {"text": "Flush the redis-cache memory", "category": "remediation", "expect_staged": True},
    {"text": "Perform rolling restart of payment pods", "category": "remediation", "expect_staged": True},
    {"text": "Restart the payment microservice", "category": "remediation", "expect_staged": True},
    {"text": "Yes, confirm", "category": "guardrail"},
    {"text": "No, cancel", "category": "guardrail"},
    {"text": "Proceed with the change", "category": "guardrail"},
    {"text": "Stop, do not do that", "category": "guardrail"},
    {"text": "Clear the staged command", "category": "guardrail"},

    # --- Category 7: Interactive Runbooks Engine (40 prompts) ---
    {"text": "List runbooks", "category": "runbook", "expect_tool": "list_runbooks"},
    {"text": "Show available runbooks", "category": "runbook", "expect_tool": "list_runbooks"},
    {"text": "What runbooks are available?", "category": "runbook", "expect_tool": "list_runbooks"},
    {"text": "Start runbook for postgres pool exhaustion", "category": "runbook", "expect_tool": "start_runbook"},
    {"text": "Start runbook redis", "category": "runbook", "expect_tool": "start_runbook"},
    {"text": "Start runbook ingress", "category": "runbook", "expect_tool": "start_runbook"},
    {"text": "Guide me through postgres pool failover runbook", "category": "runbook", "expect_tool": "start_runbook"},
    {"text": "Execute runbook for redis eviction triage", "category": "runbook", "expect_tool": "start_runbook"},
    {"text": "Next step in runbook", "category": "runbook", "expect_tool": "advance_runbook"},
    {"text": "Execute next step", "category": "runbook", "expect_tool": "advance_runbook"},
    {"text": "Advance runbook", "category": "runbook", "expect_tool": "advance_runbook"},
    {"text": "Next step", "category": "runbook", "expect_tool": "advance_runbook"},
    {"text": "Execute step", "category": "runbook", "expect_tool": "advance_runbook"},
    {"text": "Abort runbook", "category": "runbook", "expect_tool": "abort_runbook"},
    {"text": "Cancel active runbook", "category": "runbook", "expect_tool": "abort_runbook"},
    {"text": "Stop the active runbook", "category": "runbook", "expect_tool": "abort_runbook"},
    {"text": "Runbook list overview", "category": "runbook", "expect_tool": "list_runbooks"},
    {"text": "What standard operating procedures do we have?", "category": "runbook", "expect_tool": "list_runbooks"},
    {"text": "Begin redis runbook", "category": "runbook", "expect_tool": "start_runbook"},
    {"text": "Initiate ingress surge runbook", "category": "runbook", "expect_tool": "start_runbook"},
    {"text": "Walk me through postgres recovery", "category": "runbook", "expect_tool": "start_runbook"},
    {"text": "Proceed to the next runbook step", "category": "runbook", "expect_tool": "advance_runbook"},
    {"text": "Run the current step in the procedure", "category": "runbook", "expect_tool": "advance_runbook"},
    {"text": "Cancel the runbook execution", "category": "runbook", "expect_tool": "abort_runbook"},
    {"text": "Show me SOP runbooks", "category": "runbook", "expect_tool": "list_runbooks"},
    {"text": "Is there a runbook for database connection leaks?", "category": "runbook", "expect_tool": "start_runbook"},
    {"text": "Advance to next stage in SOP", "category": "runbook", "expect_tool": "advance_runbook"},
    {"text": "Execute active runbook action", "category": "runbook", "expect_tool": "advance_runbook"},
    {"text": "Stop the runbook procedure", "category": "runbook", "expect_tool": "abort_runbook"},
    {"text": "List all emergency runbooks", "category": "runbook", "expect_tool": "list_runbooks"},
    {"text": "Start the database failover SOP", "category": "runbook", "expect_tool": "start_runbook"},
    {"text": "Step through ingress mitigation runbook", "category": "runbook", "expect_tool": "start_runbook"},
    {"text": "Confirm and advance runbook", "category": "runbook", "expect_tool": "advance_runbook"},
    {"text": "Next runbook action please", "category": "runbook", "expect_tool": "advance_runbook"},
    {"text": "Abort active runbook immediately", "category": "runbook", "expect_tool": "abort_runbook"},
    {"text": "What runbook steps remain?", "category": "runbook", "expect_tool": "advance_runbook"},
    {"text": "Trigger runbook for high memory usage", "category": "runbook", "expect_tool": "start_runbook"},
    {"text": "Start SOP for gateway error surge", "category": "runbook", "expect_tool": "start_runbook"},
    {"text": "Continue with runbook", "category": "runbook", "expect_tool": "advance_runbook"},
    {"text": "Exit current runbook", "category": "runbook", "expect_tool": "abort_runbook"},

    # --- Category 8: Document Intelligence & Multi-Format Export (40 prompts) ---
    {"text": "What is in my document folder list all the items", "category": "docs", "expect_tool": "list_documents"},
    {"text": "List documents in docs", "category": "docs", "expect_tool": "list_documents"},
    {"text": "List docs", "category": "docs", "expect_tool": "list_documents"},
    {"text": "Show documents in the docs directory", "category": "docs", "expect_tool": "list_documents"},
    {"text": "What files are in my document repository?", "category": "docs", "expect_tool": "list_documents"},
    {"text": "List all items in documents folder", "category": "docs", "expect_tool": "list_documents"},
    {"text": "Show docs folder contents", "category": "docs", "expect_tool": "list_documents"},
    {"text": "Inspect document docs/ARCHITECTURE.md", "category": "docs", "expect_tool": "inspect_document"},
    {"text": "Read document docs/ARCHITECTURE.md", "category": "docs", "expect_tool": "inspect_document"},
    {"text": "Inspect document docs/DEMO_SCRIPT.md", "category": "docs", "expect_tool": "inspect_document"},
    {"text": "Read file docs/SUBMISSION_CHECKLIST.md", "category": "docs", "expect_tool": "inspect_document"},
    {"text": "Inspect document docs/COMPLETION_AUDIT.md", "category": "docs", "expect_tool": "inspect_document"},
    {"text": "Export incident report as pdf", "category": "export", "expect_tool": "export_incident_report"},
    {"text": "Export report as docx", "category": "export", "expect_tool": "export_incident_report"},
    {"text": "Download pdf report", "category": "export", "expect_tool": "export_incident_report"},
    {"text": "Export word document report", "category": "export", "expect_tool": "export_incident_report"},
    {"text": "Save pdf incident review", "category": "export", "expect_tool": "export_incident_report"},
    {"text": "Save report as word docx", "category": "export", "expect_tool": "export_incident_report"},
    {"text": "What documents do we have in docs?", "category": "docs", "expect_tool": "list_documents"},
    {"text": "Read document docs/RESEARCH_PHASES.md", "category": "docs", "expect_tool": "inspect_document"},
    {"text": "Inspect document docs/DEPLOYMENT_GUIDE.md", "category": "docs", "expect_tool": "inspect_document"},
    {"text": "List documents in the folder", "category": "docs", "expect_tool": "list_documents"},
    {"text": "What is in my documents folder?", "category": "docs", "expect_tool": "list_documents"},
    {"text": "Read pdf documentation in docs", "category": "docs", "expect_tool": "inspect_document"},
    {"text": "Export post-mortem to pdf", "category": "export", "expect_tool": "export_incident_report"},
    {"text": "Generate downloadable word report", "category": "export", "expect_tool": "export_incident_report"},
    {"text": "Inspect document docs/PITCH_DECK.md", "category": "docs", "expect_tool": "inspect_document"},
    {"text": "List all items in the docs folder", "category": "docs", "expect_tool": "list_documents"},
    {"text": "Show documents available to read", "category": "docs", "expect_tool": "list_documents"},
    {"text": "Export incident summary pdf", "category": "export", "expect_tool": "export_incident_report"},
    {"text": "Export docx postmortem document", "category": "export", "expect_tool": "export_incident_report"},
    {"text": "Download report in word format", "category": "export", "expect_tool": "export_incident_report"},
    {"text": "Save incident review to pdf file", "category": "export", "expect_tool": "export_incident_report"},
    {"text": "Check files in docs folder", "category": "docs", "expect_tool": "list_documents"},
    {"text": "Read document docs/VIDEO_DEMO_5MIN.md", "category": "docs", "expect_tool": "inspect_document"},
    {"text": "Inspect document docs/CODE_REVIEW_2026-09-08.md", "category": "docs", "expect_tool": "inspect_document"},
    {"text": "List documents in my repo", "category": "docs", "expect_tool": "list_documents"},
    {"text": "Export docx report for executives", "category": "export", "expect_tool": "export_incident_report"},
    {"text": "Generate signed PDF report", "category": "export", "expect_tool": "export_incident_report"},
    {"text": "What docs are present in the project?", "category": "docs", "expect_tool": "list_documents"},

    # --- Category 9: Web & External Search / Status Pages (35 prompts) ---
    {"text": "What is the news", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "What is the latest tech news?", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search the web for kubernetes crashloopbackoff", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search web for postgres connection pool exhaustion fix", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Look up online aws status page outage", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Google redis maxmemory eviction policy", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Duckduckgo search cloudflare outage status", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search docs for p99 latency troubleshooting", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Find online documentation for spring boot db pool", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "What are the latest headlines?", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Check breaking cloud news", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search internet for docker out of memory error", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search github for microservice circuit breaker example", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search stackoverflow for postgres pg_stat_activity", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Look up latest updates on kubernetes 1.30", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search web for envoy gateway timeout 504", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "What is the news today in AI?", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search documentation for nginx reverse proxy buffer", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search online for redis connection refused", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search web for assemblyai streaming api", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Look up online how to tune hikaricp pool", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Find documentation on prometheus alertmanager", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "What is the breaking news in tech?", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search the web for istio mutual tls failure", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Google datadog agent memory leak", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search web for uvicorn websocket timeout", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Look up online latest aws us-east-1 incident", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search docs for gunicorn worker crash", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "What are the tech headlines today?", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search internet for fast voice ai architectures", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search documentation for docker restart policies", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search web for postgres connection pool best practices", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Look up online spring boot oom dump analysis", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search the web for kubernetes pod evictions", "category": "web", "expect_tool": "search_web_or_docs"},
    {"text": "Search web for sre golden signals guide", "category": "web", "expect_tool": "search_web_or_docs"},

    # --- Category 10: Autopilot & Autonomous Mode (35 prompts) ---
    {"text": "Jarvis, run autonomously", "category": "autopilot"},
    {"text": "Run autonomously", "category": "autopilot"},
    {"text": "Self heal the cluster", "category": "autopilot"},
    {"text": "Enable autopilot mode", "category": "autopilot"},
    {"text": "Turn on autopilot", "category": "autopilot"},
    {"text": "Enable auto mode", "category": "autopilot"},
    {"text": "Switch to autonomous mode", "category": "autopilot"},
    {"text": "Run in autonomous mode and fix errors", "category": "autopilot"},
    {"text": "Self heal any degraded microservices", "category": "autopilot"},
    {"text": "Autopilot on", "category": "autopilot"},
    {"text": "Disable autopilot", "category": "autopilot"},
    {"text": "Turn off autopilot", "category": "autopilot"},
    {"text": "Stop autonomous mode", "category": "autopilot"},
    {"text": "Switch to manual approval mode", "category": "autopilot"},
    {"text": "Deactivate autopilot", "category": "autopilot"},
    {"text": "Auto-approve safe actions", "category": "autopilot"},
    {"text": "Jarvis, self heal the payment service", "category": "autopilot"},
    {"text": "Can you run autonomously?", "category": "autopilot"},
    {"text": "Activate auto remediation", "category": "autopilot"},
    {"text": "Autopilot mode status", "category": "autopilot"},
    {"text": "Engage autonomous incident commander", "category": "autopilot"},
    {"text": "Auto mode activate", "category": "autopilot"},
    {"text": "Self healing enabled", "category": "autopilot"},
    {"text": "Take autonomous control of remediation", "category": "autopilot"},
    {"text": "Stop auto healing", "category": "autopilot"},
    {"text": "Return to manual mode", "category": "autopilot"},
    {"text": "Disable auto-approval", "category": "autopilot"},
    {"text": "Run autonomously to resolve the database issue", "category": "autopilot"},
    {"text": "Autonomous triage and recovery", "category": "autopilot"},
    {"text": "Set autopilot to active", "category": "autopilot"},
    {"text": "Enable hands-free autonomous SRE", "category": "autopilot"},
    {"text": "Can I trust you to self heal?", "category": "conversational"},
    {"text": "Deactivate autonomous operations", "category": "autopilot"},
    {"text": "Turn off auto mode", "category": "autopilot"},
    {"text": "Autopilot deactivate", "category": "autopilot"},

    # --- Category 11: Logs, Topology & Telemetry (40 prompts) ---
    {"text": "Inspect logs for payment-service", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Show me the logs for order-db", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Inspect service logs for redis-cache", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Show ingress-gateway logs", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Inspect logs for database", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Check container logs for payment", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "What do the logs say for redis?", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Are there error stack traces in payment logs?", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Fetch recent logs for order-db", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Inspect gateway logs", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Show service topology", "category": "topology", "expect_tool": "get_service_topology"},
    {"text": "What are the service dependencies?", "category": "topology", "expect_tool": "get_service_topology"},
    {"text": "Show the dependency graph", "category": "topology", "expect_tool": "get_service_topology"},
    {"text": "Display topology map", "category": "topology", "expect_tool": "get_service_topology"},
    {"text": "What services does payment-service depend on?", "category": "topology", "expect_tool": "get_service_topology"},
    {"text": "Check host telemetry", "category": "host", "expect_tool": "query_host_telemetry"},
    {"text": "How are my PC vitals?", "category": "host", "expect_tool": "query_host_telemetry"},
    {"text": "Check host CPU and memory", "category": "host", "expect_tool": "query_host_telemetry"},
    {"text": "What is the machine load?", "category": "host", "expect_tool": "query_host_telemetry"},
    {"text": "Inspect host performance stats", "category": "host", "expect_tool": "query_host_telemetry"},
    {"text": "Check machine memory usage", "category": "host", "expect_tool": "query_host_telemetry"},
    {"text": "Are host vitals healthy?", "category": "host", "expect_tool": "query_host_telemetry"},
    {"text": "Query host machine telemetry", "category": "host", "expect_tool": "query_host_telemetry"},
    {"text": "Check system load on the host", "category": "host", "expect_tool": "query_host_telemetry"},
    {"text": "Inspect logs on payment-service for connection errors", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Show order-db log lines", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Check logs for ingress 502 errors", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Inspect recent log entries for redis", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Are there connection pool errors in database logs?", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "View topology blast radius", "category": "topology", "expect_tool": "get_service_topology"},
    {"text": "Show cluster dependencies", "category": "topology", "expect_tool": "get_service_topology"},
    {"text": "Topology check for downstream services", "category": "topology", "expect_tool": "get_service_topology"},
    {"text": "Host machine CPU check", "category": "host", "expect_tool": "query_host_telemetry"},
    {"text": "Host RAM and swap status", "category": "host", "expect_tool": "query_host_telemetry"},
    {"text": "Show PC vitals overview", "category": "host", "expect_tool": "query_host_telemetry"},
    {"text": "Inspect logs for payment container", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Read last 50 log lines for order-db", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Check logs on redis-cache", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "Inspect ingress gateway access logs", "category": "logs", "expect_tool": "inspect_service_logs"},
    {"text": "How many services are in the topology?", "category": "topology", "expect_tool": "get_service_topology"},

    # --- Category 12: Conversational, Greetings, Identity & Safety (75 prompts) ---
    {"text": "Hello Jarvis", "category": "conversational"},
    {"text": "Hey Jarvis", "category": "conversational"},
    {"text": "Hi Jarvis, how are you?", "category": "conversational"},
    {"text": "Good morning Jarvis", "category": "conversational"},
    {"text": "Good afternoon Jarvis", "category": "conversational"},
    {"text": "Wake up Jarvis", "category": "conversational"},
    {"text": "Who are you?", "category": "conversational"},
    {"text": "What is your name?", "category": "conversational"},
    {"text": "What are you?", "category": "conversational"},
    {"text": "Introduce yourself", "category": "conversational"},
    {"text": "What can you do?", "category": "conversational"},
    {"text": "What are your capabilities?", "category": "conversational"},
    {"text": "What features do you support?", "category": "conversational"},
    {"text": "Tell me what you can do", "category": "conversational"},
    {"text": "How does your architecture work?", "category": "conversational"},
    {"text": "Explain your dual engine architecture", "category": "conversational"},
    {"text": "How do you work?", "category": "conversational"},
    {"text": "Tell me about your system architecture", "category": "conversational"},
    {"text": "What is your safety guardrail?", "category": "conversational"},
    {"text": "How do you prevent mistakes?", "category": "conversational"},
    {"text": "Can I trust you?", "category": "conversational"},
    {"text": "What is your safety barrier?", "category": "conversational"},
    {"text": "Tell me a joke", "category": "conversational"},
    {"text": "Say something funny", "category": "conversational"},
    {"text": "Make me laugh", "category": "conversational"},
    {"text": "What time is it?", "category": "conversational"},
    {"text": "What is the current time?", "category": "conversational"},
    {"text": "What day is it today?", "category": "conversational"},
    {"text": "What is today's date?", "category": "conversational"},
    {"text": "Thank you Jarvis", "category": "conversational"},
    {"text": "Thanks for your help", "category": "conversational"},
    {"text": "Good job Jarvis", "category": "conversational"},
    {"text": "Well done", "category": "conversational"},
    {"text": "Great work on resolving that", "category": "conversational"},
    {"text": "Help", "category": "conversational"},
    {"text": "I need help", "category": "conversational"},
    {"text": "Page the on-call team", "category": "pager", "expect_tool": "trigger_pager"},
    {"text": "Escalate to the database team", "category": "pager", "expect_tool": "trigger_pager"},
    {"text": "Send a page to on-call: payment service is crashing", "category": "pager", "expect_tool": "trigger_pager"},
    {"text": "Escalate this sev-1 incident to senior SRE", "category": "pager", "expect_tool": "trigger_pager"},
    {"text": "Verify recovery", "category": "recovery", "expect_tool": "verify_recovery"},
    {"text": "Are we recovered yet?", "category": "recovery", "expect_tool": "verify_recovery"},
    {"text": "Did that fix the problem?", "category": "recovery", "expect_tool": "verify_recovery"},
    {"text": "Check recovery status", "category": "recovery", "expect_tool": "verify_recovery"},
    {"text": "Generate postmortem report", "category": "postmortem", "expect_tool": "generate_postmortem"},
    {"text": "Create incident review", "category": "postmortem", "expect_tool": "generate_postmortem"},
    {"text": "Generate post-mortem document", "category": "postmortem", "expect_tool": "generate_postmortem"},
    {"text": "Wrap up the incident", "category": "postmortem", "expect_tool": "generate_postmortem"},
    {"text": "Generate postmortem with LeMUR", "category": "postmortem", "expect_tool": "generate_postmortem"},
    {"text": "What is your status?", "category": "conversational"},
    {"text": "Are you listening?", "category": "conversational"},
    {"text": "Jarvis, are you online?", "category": "conversational"},
    {"text": "Who made you?", "category": "conversational"},
    {"text": "What LLM are you using?", "category": "conversational"},
    {"text": "Are you ready for the hackathon?", "category": "conversational"},
    {"text": "What is the capital of France?", "category": "conversational"},
    {"text": "Can you play music?", "category": "conversational"},
    {"text": "What is 2 plus 2?", "category": "conversational"},
    {"text": "What is the meaning of SRE?", "category": "conversational"},
    {"text": "Tell me about Site Reliability Engineering", "category": "conversational"},
    {"text": "Why do we have postmortems?", "category": "conversational"},
    {"text": "What are error budgets?", "category": "conversational"},
    {"text": "Explain MTTR", "category": "conversational"},
    {"text": "What is P99 latency?", "category": "conversational"},
    {"text": "Standby Jarvis", "category": "conversational"},
    {"text": "Awaiting instructions", "category": "conversational"},
    {"text": "System operational check", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Ping", "category": "conversational"},
    {"text": "Status report", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "All clear?", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Check all services", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Is the database up?", "category": "health", "expect_tool": "get_cluster_health"},
    {"text": "Can you hear me?", "category": "conversational"},
    {"text": "Testing voice audio stream", "category": "conversational"},
    {"text": "Good evening Jarvis", "category": "conversational"},
]

# Ensure we have exactly 500 prompts by generating realistic, diverse variations
def expand_to_500() -> List[Dict[str, Any]]:
    items = list(PROMPTS)
    initial_count = len(items)
    
    # Template generators for diverse, real-world SRE variations
    service_names = ["payment-service", "order-db", "redis-cache", "ingress-gateway"]
    metrics = ["CPU load", "memory usage", "p99 latency", "error rate", "thread pool", "saturation"]
    
    # 1. Telemetry specific queries
    for s in service_names:
        for m in metrics:
            items.append({"text": f"What is the {m} on {s} right now?", "category": "telemetry", "expect_tool": "query_telemetry"})
            items.append({"text": f"Check {s} {m} anomalies", "category": "telemetry", "expect_tool": "query_telemetry"})
            items.append({"text": f"Inspect {m} metrics for {s}", "category": "telemetry", "expect_tool": "query_telemetry"})
    
    # 2. Logs specific queries
    for s in service_names:
        for err in ["NullPointerException", "ConnectionReset", "TimeoutException", "OOMKilled", "504 Gateway Timeout"]:
            items.append({"text": f"Search {s} logs for {err}", "category": "logs", "expect_tool": "inspect_service_logs"})
            items.append({"text": f"Does {s} show any {err} in the logs?", "category": "logs", "expect_tool": "inspect_service_logs"})
            
    # 3. Conversational / SRE assistant queries
    greetings = ["Greetings Jarvis", "Salutations", "Jarvis, status please", "Report on duty", "Are systems green?"]
    for g in greetings:
        items.append({"text": g, "category": "conversational"})
    for s in service_names:
        items.append({"text": f"Is {s} operating within acceptable error budget?", "category": "health", "expect_tool": "get_cluster_health"})
        items.append({"text": f"Check SLO compliance for {s}", "category": "telemetry", "expect_tool": "query_telemetry"})
        items.append({"text": f"Did {s} restart recently?", "category": "logs", "expect_tool": "inspect_service_logs"})
        
    # 4. Web search queries
    searches = [
        "best practices for postgres connection pooling", "how to debug redis evictions",
        "envoy upstream timeout tuning", "fastapi uvicorn production tuning",
        "reportlab pdf layout formatting", "assemblyai universal-3 pro benchmarks",
        "chaos engineering pod restart impact", "four golden signals sre book",
        "microhecl root cause algorithm details", "tree of thoughts llm reasoning paper"
    ]
    for q in searches:
        items.append({"text": f"Search web for {q}", "category": "web", "expect_tool": "search_web_or_docs"})
        items.append({"text": f"Search docs for {q}", "category": "web", "expect_tool": "search_web_or_docs"})

    # 5. Document queries
    doc_files = ["docs/ARCHITECTURE.md", "docs/DEMO_SCRIPT.md", "docs/SUBMISSION_CHECKLIST.md", "docs/DEPLOYMENT_GUIDE.md"]
    for d in doc_files:
        items.append({"text": f"Inspect document {d}", "category": "docs", "expect_tool": "inspect_document"})
        items.append({"text": f"Read document {d}", "category": "docs", "expect_tool": "inspect_document"})

    # Cap or pad to exactly 500 prompts
    if len(items) > 500:
        return items[:500]
    while len(items) < 500:
        idx = len(items) + 1
        items.append({"text": f"Jarvis, check cluster health update #{idx}", "category": "health", "expect_tool": "get_cluster_health"})
    return items


async def run_stress_test(stop_on_error: bool = False, max_prompts: int = 500, start_idx: int = 1):
    from app.core.session import OperatorSession, current_session, sessions
    from app.core.auth_rbac import operator_registry, SRERole, security_manager
    from app.services.orchestrator import agent_orchestrator
    from app.core.state import cluster_state

    # Initialize and bind isolated operator session
    session = OperatorSession()
    session.operator_id = 'op-demo'
    session.operator = 'Demo Operator'
    session.role = SRERole.SRE_COMMANDER.value
    session.authenticated = True
    sessions[session.id] = session
    token = current_session.set(session)
    security_manager.current_role = SRERole.SRE_COMMANDER
    security_manager.operator_id = 'op-demo'
    security_manager.session_operator = 'Demo Operator'
    security_manager._session = session
    operator_registry.session_is_valid = lambda s: True

    catalog = expand_to_500()[start_idx-1:start_idx-1+max_prompts]
    total = len(catalog)
    print(f"================================================================")
    print(f"  STARTING INCIDENTVOICE {total}-PROMPT SEQUENTIAL STRESS TEST  ")
    print(f"================================================================\n")

    passed = 0
    failed = 0
    failures = []
    start_time = time.time()

    for idx, item in enumerate(catalog, start=start_idx):
        prompt = item["text"]
        category = item.get("category", "general")
        expected_tool = item.get("expect_tool")
        expect_staged = item.get("expect_staged", False)

        # Clear any prior staged action before read-only tests so approval gate doesn't block them
        if not expect_staged and category not in ["guardrail", "clarification"] and agent_orchestrator.staged_action:
            agent_orchestrator.cancel_staged_remediation()

        t0 = time.perf_counter()
        try:
            # Wait for maximum 30 seconds per prompt
            spoken, tools, postmortem = await asyncio.wait_for(
                agent_orchestrator.process_user_turn(prompt),
                timeout=30.0
            )
            duration_ms = (time.perf_counter() - t0) * 1000

            tool_names = [t.get("tool_name") for t in (tools or [])]

            # Validation criteria
            error_reason = None
            if not spoken or not isinstance(spoken, str) or not spoken.strip():
                error_reason = "Empty or non-string spoken response returned."
            elif expected_tool and not (expected_tool in tool_names if isinstance(expected_tool, str) else any(t in tool_names for t in expected_tool)):
                error_reason = f"Expected tool '{expected_tool}' was not invoked. Got tools: {tool_names}"
            elif expect_staged and not agent_orchestrator.awaiting_confirmation:
                error_reason = f"Action was expected to be staged for approval, but awaiting_confirmation is False."

            if error_reason:
                failed += 1
                failure_info = {
                    "index": idx,
                    "prompt": prompt,
                    "category": category,
                    "error": error_reason,
                    "spoken": spoken,
                    "tools": tool_names,
                    "duration_ms": duration_ms
                }
                failures.append(failure_info)
                print(f"❌ [Prompt {idx:03d}/{total}] FAILED: '{prompt}' ({duration_ms:.1f}ms)")
                print(f"   Reason: {error_reason}")
                print(f"   Spoken: {str(spoken)[:120]}...\n")
                if stop_on_error:
                    print(f"Stopping immediately on error as requested.")
                    break
            else:
                passed += 1
                tool_summary = f"[{', '.join(tool_names)}]" if tool_names else "[conversational]"
                # Print every prompt
                print(f"✅ [Prompt {idx:03d}/{total}] PASS: '{prompt[:45]}' -> {tool_summary} ({duration_ms:.1f}ms)")

        except Exception as exc:
            failed += 1
            duration_ms = (time.perf_counter() - t0) * 1000
            failure_info = {
                "index": idx,
                "prompt": prompt,
                "category": category,
                "error": f"Exception raised: {type(exc).__name__}: {str(exc)}",
                "duration_ms": duration_ms
            }
            failures.append(failure_info)
            print(f"💥 [Prompt {idx:03d}/{total}] EXCEPTION: '{prompt}' ({duration_ms:.1f}ms)")
            print(f"   {type(exc).__name__}: {str(exc)}\n")
            if stop_on_error:
                break

    total_elapsed = time.time() - start_time
    print(f"\n================================================================")
    print(f"  STRESS TEST COMPLETED in {total_elapsed:.2f}s                 ")
    print(f"  Total: {total} | Passed: {passed} | Failed: {failed}          ")
    print(f"  Success Rate: {(passed / total) * 100:.1f}%                  ")
    print(f"================================================================")

    if failures:
        print(f"\n--- Summary of Failures ({len(failures)}) ---")
        for f in failures[:25]:
            print(f"• #{f['index']}: '{f['prompt']}' -> {f['error']}")
        if len(failures) > 25:
            print(f"... and {len(failures) - 25} more.")
        return False
    else:
        print(f"\n🌟 ALL {total} PROMPTS PASSED WITH ZERO ERRORS!")
        return True


if __name__ == "__main__":
    stop_flag = "--stop-on-error" in sys.argv
    max_p = 500
    start_p = 1
    for arg in sys.argv:
        if arg.startswith("--max="):
            max_p = int(arg.split("=")[1])
        if arg.startswith("--start="):
            start_p = int(arg.split("=")[1])
    success = asyncio.run(run_stress_test(stop_on_error=stop_flag, max_prompts=max_p, start_idx=start_p))
    sys.exit(0 if success else 1)

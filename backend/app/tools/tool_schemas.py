"""JSON Schemas for LLM Tool Calling (OpenAI / Gemini function format)"""

SRE_TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_cluster_health",
            "description": "Get current health status of all cluster microservices, active alerts, error rates, and incident state.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "inspect_service_logs",
            "description": "Inspect recent error, warn, and fatal logs for a specific microservice (e.g. payment-service, order-db, ingress-gateway, redis-cache).",
            "parameters": {
                "type": "object",
                "properties": {
                    "service_name": {
                        "type": "string",
                        "description": "The name of the service to inspect logs for (e.g. 'payment-service', 'order-db', 'redis-cache')"
                    },
                    "lines": {
                        "type": "integer",
                        "description": "Number of recent log lines to retrieve (default: 5)"
                    }
                },
                "required": ["service_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "query_telemetry",
            "description": "Query specific real-time metrics including CPU, RAM, RPS, error rate %, and P99 latency for a service.",
            "parameters": {
                "type": "object",
                "properties": {
                    "service_name": {
                        "type": "string",
                        "description": "Target service name"
                    }
                },
                "required": ["service_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "execute_remediation",
            "description": "Execute an operational remediation action on a service to resolve an active outage.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["restart_pod", "scale_replicas", "flush_cache", "enable_circuit_breaker", "rollback_release"],
                        "description": "The remediation action to execute"
                    },
                    "service_name": {
                        "type": "string",
                        "description": "Target service name to execute the remediation on"
                    },
                    "count": {
                        "type": "integer",
                        "description": "Desired replica count if action is 'scale_replicas' (default: 5)"
                    }
                },
                "required": ["action", "service_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "query_host_telemetry",
            "description": "Query live Linux host operating system performance, load averages, memory usage, and top active processes.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "trigger_pager",
            "description": "Page an engineering escalation team (e.g., database-team, infrastructure, security).",
            "parameters": {
                "type": "object",
                "properties": {
                    "team": {
                        "type": "string",
                        "description": "Name of team to page (e.g. 'database-team', 'security', 'payments-lead')"
                    },
                    "message": {
                        "type": "string",
                        "description": "Brief description of the escalation reason"
                    }
                },
                "required": ["team", "message"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_postmortem",
            "description": "Synthesize a comprehensive multi-artifact Post-Mortem Report (Formal Markdown PIR, Jira Tickets JSON, and Slack Outage Briefing) via AssemblyAI LeMUR.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    }
]

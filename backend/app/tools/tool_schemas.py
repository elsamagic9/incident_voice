"""JSON Schemas for LLM Tool Calling (OpenAI / Gemini function format)"""

SRE_TOOL_DEFINITIONS = [
    {"type": "function", "function": {"name": "investigate_incident", "description": "Investigate the incident across services, capture health and log evidence, and return ranked unverified hypotheses citing observation IDs. Read-only; does not execute remediation.", "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {"name": "verify_recovery", "description": "Check current service health and compare it with the captured investigation baseline. Report remaining degraded or unverified services; do not equate successful execution with recovery.", "parameters": {"type": "object", "properties": {}, "required": []}}},
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
            "description": "Request a remediation on a service. Despite its name, this tool STAGES the exact action for operator approval; it does not execute a new mutation without approval. You MUST call this tool to stage a restart, scaling change, cache flush, rollback, circuit breaker, or failover. A spoken statement alone does not stage anything. Return and inspect its status before telling the operator an action is staged.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["restart_pod", "scale_replicas", "flush_cache", "enable_circuit_breaker", "rollback_release", "failover_traffic"],
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
            "description": "Synthesize a comprehensive multi-artifact Post-Mortem Report (Formal Markdown PIR, Jira Tickets JSON, and Slack Outage Briefing) via AssemblyAI LLM Gateway.",
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
            "name": "list_runbooks",
            "description": "List all available voice-guided SRE Standard Operating Procedure runbooks (e.g. Postgres pool failover, Redis eviction triage, Ingress surge).",
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
            "name": "start_runbook",
            "description": "Initiate a voice-guided interactive SRE runbook workflow to guide engineers step-by-step through outage triage and remediation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "runbook_id": {
                        "type": "string",
                        "description": "Identifier or title of the runbook (e.g. 'runbook-pg-pool', 'runbook-redis-eviction', 'runbook-ingress-surge')"
                    }
                },
                "required": ["runbook_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "advance_runbook",
            "description": "Execute the current runbook step, perform automated telemetry verification, and advance to the next step.",
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
            "name": "abort_runbook",
            "description": "Cancel and abort the active SRE runbook workflow.",
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
            "name": "get_service_topology",
            "description": "Retrieve the live service dependency topology map, traffic RPS, and active cascading blast radiuses.",
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
            "name": "cordon_node",
            "description": "Cordon a Kubernetes worker node to prevent new pod scheduling. Used for maintenance or to drain workloads.",
            "parameters": {
                "type": "object",
                "properties": {
                    "node_name": {
                        "type": "string",
                        "description": "The Kubernetes node name to cordon (e.g. 'ip-10-0-1-12.ec2.internal')"
                    }
                },
                "required": ["node_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "k8s_rollout_restart",
            "description": "Perform a rolling restart of a Kubernetes deployment, gracefully cycling all pods.",
            "parameters": {
                "type": "object",
                "properties": {
                    "deployment_name": {
                        "type": "string",
                        "description": "The deployment or service name to rollout restart"
                    }
                },
                "required": ["deployment_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_web_or_docs",
            "description": "Search the live web, technical documentation, breaking news, articles, and cloud status pages for any topic or query.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search terms, topic, or error message (e.g. 'latest tech news', 'Postgres connection pool max connections', 'AWS us-east-1 status')"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of search results to return (default: 4)"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "inspect_document",
            "description": "Inspect and extract text from an enterprise document (PDF runbooks, Word DOCX specifications, Markdown, or text files) with page and section citations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to the document file (e.g. 'docs/database_runbook.pdf' or 'docs/architecture.docx')"
                    },
                    "query": {
                        "type": "string",
                        "description": "Optional search term to filter specific sections or pages within the document"
                    },
                    "max_pages": {
                        "type": "integer",
                        "description": "Maximum number of pages to inspect (default: 10)"
                    }
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "export_incident_report",
            "description": "Generate and export a formal Post-Incident Review document in PDF or Microsoft Word (.docx) format with Golden Signals receipts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "format": {
                        "type": "string",
                        "enum": ["pdf", "docx"],
                        "description": "Document export format ('pdf' or 'docx')"
                    },
                    "filename": {
                        "type": "string",
                        "description": "Optional custom output filename"
                    }
                },
                "required": ["format"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "transcribe_media_recording",
            "description": "Transcribe and analyze an incident audio recording (.wav, .mp3, .m4a) or video recording (.mp4, .mov, .webm) via AssemblyAI speech models.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Local path or URL to the incident audio or video file"
                    },
                    "media_type": {
                        "type": "string",
                        "enum": ["auto", "audio", "video"],
                        "description": "Media type (default: 'auto')"
                    }
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "retrieve_incident_memory",
            "description": "Retrieve relevant past incident post-mortems, runbook outcomes, and architectural heuristics from the Generative Agents episodic memory stream using triad retrieval scoring (Recency x Importance x Relevance).",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query or incident context (e.g. 'order-db connection pool', 'payment service 504')"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of memories to return (default: 3)"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "locate_causal_root_cause",
            "description": "Execute MicroHECL causal graph root cause localization across the microservice dependency DAG. Disambiguates cascading symptoms from the authentic root cause and returns causal confidence.",
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
            "name": "match_historical_incident",
            "description": "Execute DéjàVu failure symptom signature matching against historical outages using cosine similarity. Recommends historically validated playbooks with proven MTTR reduction.",
            "parameters": {
                "type": "object",
                "properties": {
                    "threshold": {
                        "type": "number",
                        "description": "Cosine similarity threshold (default: 0.70)"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "plan_mitigation_tree",
            "description": "Execute Tree of Thoughts (ToT) deliberate mitigation planning with environment rollout simulation. Evaluates multi-step remediation trajectories and selects Pareto-optimal recovery path.",
            "parameters": {
                "type": "object",
                "properties": {
                    "max_depth": {
                        "type": "integer",
                        "description": "Maximum tree exploration depth (default: 2)"
                    }
                },
                "required": []
            }
        }
    }
]




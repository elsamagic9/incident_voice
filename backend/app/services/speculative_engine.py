"""
Speculative Telemetry Pre-computation for Ultra-Low Latency Voice AI
Based on:
- Leviathan et al., Fast Inference from Transformers via Speculative Decoding (ICML 2023)
- Kim et al., Speculative Streaming: Fast and Accurate Streaming Speech Recognition (Interspeech 2024)
"""

import json
import logging
import re
import time
from typing import Any, Dict, Optional, Tuple
from app.core.session import SessionLocal

logger = logging.getLogger(__name__)

DEFAULT_SPECULATIVE_TTL = 5.0  # seconds


class SpeculativeTelemetryEngine:
    """
    Speculative Pre-computation Engine (Leviathan et al. 2023; Kim et al. 2024).
    Asynchronously anticipates tool lookups from streaming partial ASR tokens,
    pre-warming L1 cache to achieve sub-2ms tool responses on sentence completion.
    """

    def __init__(self, ttl: float = DEFAULT_SPECULATIVE_TTL):
        self.ttl = ttl
        self.cache: Dict[str, Tuple[float, Any]] = {}
        self.hits: int = 0
        self.misses: int = 0
        self.prefetches: int = 0

    def _cache_key(self, tool_name: str, args: Dict[str, Any]) -> str:
        serialized_args = json.dumps(args, sort_keys=True)
        return f"{tool_name}:{serialized_args}"

    def prefetch(self, partial_transcript: str) -> None:
        """
        Parses streaming partial transcript for early intent tokens and pre-computes telemetry.
        """
        if not partial_transcript:
            return
        lower = partial_transcript.lower()

        # Identify target service
        target = None
        if "payment" in lower:
            target = "payment-service"
        elif "db" in lower or "database" in lower or "postgres" in lower:
            target = "order-db"
        elif "redis" in lower or "cache" in lower:
            target = "redis-cache"
        elif "ingress" in lower or "gateway" in lower:
            target = "ingress-gateway"
        elif "auth" in lower:
            target = "auth-service"

        # Determine speculative tool
        if any(w in lower for w in ["log", "why", "error"]):
            if target:
                self._execute_speculative_cache("inspect_service_logs", {"service_name": target})
        elif any(w in lower for w in ["metric", "telemetry", "latency", "cpu", "saturation"]):
            if target:
                self._execute_speculative_cache("query_telemetry", {"service_name": target})
            elif any(w in lower for w in ["host", "pc", "machine"]):
                self._execute_speculative_cache("query_host_telemetry", {})
        elif any(w in lower for w in ["health", "status", "overview", "cluster"]):
            self._execute_speculative_cache("get_cluster_health", {})
        elif any(w in lower for w in ["root cause", "causal"]):
            self._execute_speculative_cache("locate_causal_root_cause", {})

    def _execute_speculative_cache(self, tool_name: str, args: Dict[str, Any]) -> None:
        key = self._cache_key(tool_name, args)
        now = time.time()
        # Avoid redundant prefetch if valid cache exists
        if key in self.cache and (now - self.cache[key][0]) < (self.ttl / 2.0):
            return

        try:
            from app.tools.sre_tools import SRE_TOOL_MAP
            tool_fn = SRE_TOOL_MAP.get(tool_name)
            if tool_fn:
                result = tool_fn(**args)
                self.cache[key] = (now, result)
                self.prefetches += 1
                logger.debug("Speculative prefetch cached for %s (args: %s)", tool_name, args)
        except Exception as exc:
            logger.debug("Speculative prefetch omitted for %s: %s", tool_name, exc)

    def get_speculative_result(self, tool_name: str, args: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Retrieves pre-warmed result if cached within TTL.
        """
        key = self._cache_key(tool_name, args)
        now = time.time()
        if key in self.cache:
            ts, result = self.cache[key]
            if (now - ts) <= self.ttl:
                self.hits += 1
                return {
                    "cache_hit": True,
                    "speculative_age_ms": round((now - ts) * 1000, 1),
                    "result": result,
                }
            else:
                del self.cache[key]

        self.misses += 1
        return None

    def get_stats(self) -> Dict[str, Any]:
        total = self.hits + self.misses
        hit_ratio = round((self.hits / total) * 100.0, 1) if total > 0 else 0.0
        return {
            "total_prefetches": self.prefetches,
            "cache_hits": self.hits,
            "cache_misses": self.misses,
            "hit_ratio_percent": hit_ratio,
            "active_cache_entries": len(self.cache),
        }

    def clear(self) -> None:
        self.cache.clear()


class SpeculativeService:
    def __init__(self):
        self.engine = SpeculativeTelemetryEngine()

    def reset(self):
        self.engine = SpeculativeTelemetryEngine()


speculative_service = SessionLocal("speculative", SpeculativeService)

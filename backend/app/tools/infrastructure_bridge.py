import asyncio
import logging
import subprocess
import time
from typing import Dict, Any, List, Optional
import psutil

logger = logging.getLogger("infra_bridge")

class InfrastructureBridge:
    """
    Connects IncidentVoice to real host telemetry and real Docker containers.
    Provides deterministic fallback if Docker is not active.
    """

    def is_docker_available(self) -> bool:
        try:
            res = subprocess.run(["docker", "info"], capture_output=True, text=True, timeout=2)
            return res.returncode == 0
        except Exception:
            return False

    def list_running_containers(self) -> List[Dict[str, str]]:
        if not self.is_docker_available():
            return []
        try:
            res = subprocess.run(
                ["docker", "ps", "--format", "{{.ID}}|{{.Names}}|{{.Status}}|{{.Image}}"],
                capture_output=True, text=True, timeout=3
            )
            containers = []
            for line in res.stdout.strip().split("\n"):
                if line.strip():
                    parts = line.split("|")
                    if len(parts) >= 4:
                        containers.append({
                            "id": parts[0],
                            "name": parts[1],
                            "status": parts[2],
                            "image": parts[3]
                        })
            return containers
        except Exception as e:
            logger.error(f"Error listing containers: {e}")
            return []

    def inspect_container_logs(self, container_name: str, lines: int = 8) -> Dict[str, Any]:
        if not self.is_docker_available():
            return {"error": "Docker engine not reachable."}
        import re
        sanitized = re.sub(r'[^a-zA-Z0-9_\-]', '', container_name)
        if not sanitized or sanitized.startswith("-"):
            return {"error": "Invalid container identifier."}
        try:
            res = subprocess.run(
                ["docker", "logs", "--tail", str(lines), sanitized],
                capture_output=True, text=True, timeout=4
            )
            logs = res.stdout.strip().split("\n") if res.stdout.strip() else res.stderr.strip().split("\n")
            return {
                "container": sanitized,
                "exit_code": res.returncode,
                "lines": [l for l in logs if l.strip()]
            }
        except Exception as e:
            return {"error": f"Failed to fetch logs: {e}"}

    def restart_container(self, container_name: str) -> Dict[str, Any]:
        if not self.is_docker_available():
            return {"error": "Docker engine not reachable."}
        import re
        sanitized = re.sub(r'[^a-zA-Z0-9_\-]', '', container_name)
        if not sanitized or sanitized.startswith("-"):
            return {"error": "Invalid container identifier."}
        try:
            start_t = time.time()
            res = subprocess.run(
                ["docker", "restart", sanitized],
                capture_output=True, text=True, timeout=10
            )
            duration = time.time() - start_t
            if res.returncode == 0:
                return {
                    "success": True,
                    "container": sanitized,
                    "duration_seconds": round(duration, 2),
                    "message": f"Container '{sanitized}' successfully restarted in {round(duration, 2)}s."
                }
            return {"success": False, "error": res.stderr.strip()}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_host_telemetry(self) -> Dict[str, Any]:
        """Reads real Linux CPU, Memory, Disk, and Load averages."""
        try:
            cpu_pct = psutil.cpu_percent(interval=None)
            mem = psutil.virtual_memory()
            disk = psutil.disk_usage("/")
            load1, load5, load15 = psutil.getloadavg()

            return {
                "host_cpu_percent": cpu_pct,
                "host_memory_used_gb": round(mem.used / (1024 ** 3), 2),
                "host_memory_total_gb": round(mem.total / (1024 ** 3), 2),
                "host_memory_percent": mem.percent,
                "disk_used_percent": disk.percent,
                "load_averages": [round(load1, 2), round(load5, 2), round(load15, 2)],
                "active_processes": len(psutil.pids())
            }
        except Exception as e:
            return {"error": f"Failed to query host telemetry: {e}"}

    def get_top_processes(self, limit: int = 5) -> List[Dict[str, Any]]:
        """Finds top CPU-consuming real processes on Linux."""
        try:
            processes = []
            for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'status']):
                try:
                    info = proc.info
                    processes.append(info)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            # Sort by CPU descending
            sorted_procs = sorted(processes, key=lambda p: p.get('cpu_percent') or 0, reverse=True)
            return sorted_procs[:limit]
        except Exception as e:
            logger.error(f"Error fetching processes: {e}")
            return []

infra_bridge = InfrastructureBridge()

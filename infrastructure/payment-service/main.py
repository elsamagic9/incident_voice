import logging
import time
from fastapi import FastAPI, Response, status

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] payment_core: %(message)s")
logger = logging.getLogger("payment_service")

app = FastAPI(title="Payment Service Sandbox")

is_failing = True  # Starts in outage state for demonstration

@app.get("/health")
def health(response: Response):
    if is_failing:
        logger.error("[FATAL] DBConnectionPoolTimeout: connection acquired timeout after 5000ms (max_connections=50 reached)")
        logger.error("[ERROR] Thread pool starvation: 120 pending worker coroutines blocked on db connection")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unhealthy", "error": "Database connection pool exhausted", "error_rate": "42.6%"}
    return {"status": "healthy", "p99_latency_ms": 42.0, "error_rate": "0.01%"}

@app.post("/crash")
def trigger_crash():
    global is_failing
    is_failing = True
    logger.error("[ALERT] Simulated Sev-1 outage triggered on payment processing pipeline")
    return {"status": "crashed"}

@app.post("/recover")
def trigger_recovery():
    global is_failing
    is_failing = False
    logger.info("[RECOVERY] Pod restarted, connection pool recycled and healthy.")
    return {"status": "recovered"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from app.core.state import cluster_state

class TopologyNode(BaseModel):
    id: str
    name: str
    type: str  # "client", "gateway", "service", "database", "cache"
    status: str  # "healthy", "degraded", "critical"
    rps: float
    latency_p99_ms: float
    cpu_percent: float
    memory_percent: float
    error_rate_pct: float
    is_blast_radius: bool = False
    is_bottleneck: bool = False
    active_alerts: List[str] = Field(default_factory=list)
    x: int
    y: int

class TopologyEdge(BaseModel):
    id: str
    source: str
    target: str
    rps: float
    latency_ms: float
    status: str  # "healthy", "congested", "critical"
    error_rate_pct: float
    protocol: str = "HTTP/gRPC"

class ServiceTopology(BaseModel):
    nodes: List[TopologyNode]
    edges: List[TopologyEdge]
    blast_radius_service_ids: List[str]
    root_cause_service_id: Optional[str] = None
    cascading_failure_active: bool = False
    total_cluster_rps: float = 8400.0

def get_service_topology() -> Dict[str, Any]:
    """
    Computes real-time dynamic microservice topology, traffic flow metrics,
    and cascading blast radius across distributed dependencies.
    """
    svcs = cluster_state.services
    payment = svcs.get("payment-service")
    order_db = svcs.get("order-db")
    redis = svcs.get("redis-cache")
    ingress = svcs.get("ingress-gateway")
    auth = svcs.get("auth-service")

    # Determine cascading blast radius
    blast_radius = []
    root_cause = None
    cascading = False

    if order_db and order_db.status == "critical":
        blast_radius.extend(["order-db", "payment-service", "ingress-gateway"])
        if redis and redis.status in ["critical", "degraded"]:
            blast_radius.append("redis-cache")
        root_cause = "order-db"
        cascading = True
    elif payment and payment.status == "critical":
        blast_radius.extend(["payment-service", "order-db", "redis-cache", "ingress-gateway"])
        root_cause = "payment-service"
        cascading = True
    elif ingress and ingress.status in ["critical", "degraded"]:
        blast_radius.append("ingress-gateway")

    # Ingress and client traffic
    client_status = "healthy"
    ingress_status = ingress.status if ingress else "healthy"
    payment_status = payment.status if payment else "healthy"
    order_db_status = order_db.status if order_db else "healthy"
    redis_status = redis.status if redis else "healthy"
    auth_status = auth.status if auth else "healthy"

    nodes: List[TopologyNode] = [
        TopologyNode(
            id="client-traffic",
            name="External Client Traffic",
            type="client",
            status="healthy",
            rps=8400.0,
            latency_p99_ms=12.0,
            cpu_percent=10.0,
            memory_percent=15.0,
            error_rate_pct=0.0,
            is_blast_radius=False,
            is_bottleneck=False,
            active_alerts=[],
            x=50,
            y=180
        ),
        TopologyNode(
            id="ingress-gateway",
            name=ingress.name if ingress else "Envoy Ingress Gateway",
            type="gateway",
            status=ingress_status,
            rps=8400.0,
            latency_p99_ms=ingress.latency_p99_ms if ingress else 480.0,
            cpu_percent=ingress.cpu_percent if ingress else 68.0,
            memory_percent=ingress.memory_percent if ingress else 55.0,
            error_rate_pct=ingress.error_rate_pct if ingress else 14.8,
            is_blast_radius="ingress-gateway" in blast_radius,
            is_bottleneck=False,
            active_alerts=ingress.active_alerts if ingress else [],
            x=280,
            y=180
        ),
        TopologyNode(
            id="auth-service",
            name=auth.name if auth else "Auth Broker",
            type="service",
            status=auth_status,
            rps=2100.0,
            latency_p99_ms=auth.latency_p99_ms if auth else 18.0,
            cpu_percent=auth.cpu_percent if auth else 18.0,
            memory_percent=auth.memory_percent if auth else 32.0,
            error_rate_pct=auth.error_rate_pct if auth else 0.01,
            is_blast_radius=False,
            is_bottleneck=False,
            active_alerts=auth.active_alerts if auth else [],
            x=520,
            y=70
        ),
        TopologyNode(
            id="payment-service",
            name=payment.name if payment else "Payment Processing",
            type="service",
            status=payment_status,
            rps=6300.0,
            latency_p99_ms=payment.latency_p99_ms if payment else 2850.0,
            cpu_percent=payment.cpu_percent if payment else 94.5,
            memory_percent=payment.memory_percent if payment else 89.2,
            error_rate_pct=payment.error_rate_pct if payment else 42.6,
            is_blast_radius="payment-service" in blast_radius,
            is_bottleneck=(root_cause == "payment-service"),
            active_alerts=payment.active_alerts if payment else [],
            x=520,
            y=290
        ),
        TopologyNode(
            id="order-db",
            name=order_db.name if order_db else "PostgreSQL Primary Pool",
            type="database",
            status=order_db_status,
            rps=4200.0,
            latency_p99_ms=order_db.latency_p99_ms if order_db else 1450.0,
            cpu_percent=order_db.cpu_percent if order_db else 88.4,
            memory_percent=order_db.memory_percent if order_db else 91.0,
            error_rate_pct=order_db.error_rate_pct if order_db else 12.0,
            is_blast_radius="order-db" in blast_radius,
            is_bottleneck=(root_cause == "order-db"),
            active_alerts=order_db.active_alerts if order_db else [],
            x=770,
            y=210
        ),
        TopologyNode(
            id="redis-cache",
            name=redis.name if redis else "Redis Cluster",
            type="cache",
            status=redis_status,
            rps=5100.0,
            latency_p99_ms=redis.latency_p99_ms if redis else 180.0,
            cpu_percent=redis.cpu_percent if redis else 72.0,
            memory_percent=redis.memory_percent if redis else 81.0,
            error_rate_pct=redis.error_rate_pct if redis else 6.5,
            is_blast_radius="redis-cache" in blast_radius,
            is_bottleneck=False,
            active_alerts=redis.active_alerts if redis else [],
            x=770,
            y=370
        )
    ]

    # Dynamic Edge States
    edge_ingress_status = "critical" if ingress_status == "critical" else ("congested" if ingress_status == "degraded" else "healthy")
    edge_payment_status = "critical" if payment_status == "critical" else ("congested" if payment_status == "degraded" else "healthy")
    edge_db_status = "critical" if order_db_status == "critical" else ("congested" if order_db_status == "degraded" else "healthy")
    edge_redis_status = "critical" if redis_status == "critical" else ("congested" if redis_status == "degraded" else "healthy")

    edges: List[TopologyEdge] = [
        TopologyEdge(
            id="e-client-ingress",
            source="client-traffic",
            target="ingress-gateway",
            rps=8400.0,
            latency_ms=14.0,
            status=edge_ingress_status,
            error_rate_pct=ingress.error_rate_pct if ingress else 0.0,
            protocol="HTTPS"
        ),
        TopologyEdge(
            id="e-ingress-auth",
            source="ingress-gateway",
            target="auth-service",
            rps=2100.0,
            latency_ms=18.0,
            status="healthy",
            error_rate_pct=0.01,
            protocol="gRPC"
        ),
        TopologyEdge(
            id="e-ingress-payment",
            source="ingress-gateway",
            target="payment-service",
            rps=6300.0,
            latency_ms=payment.latency_p99_ms if payment else 480.0,
            status=edge_payment_status,
            error_rate_pct=payment.error_rate_pct if payment else 42.6,
            protocol="gRPC"
        ),
        TopologyEdge(
            id="e-payment-db",
            source="payment-service",
            target="order-db",
            rps=4200.0,
            latency_ms=order_db.latency_p99_ms if order_db else 1450.0,
            status=edge_db_status,
            error_rate_pct=order_db.error_rate_pct if order_db else 12.0,
            protocol="TCP / PgPool"
        ),
        TopologyEdge(
            id="e-payment-redis",
            source="payment-service",
            target="redis-cache",
            rps=5100.0,
            latency_ms=redis.latency_p99_ms if redis else 180.0,
            status=edge_redis_status,
            error_rate_pct=redis.error_rate_pct if redis else 6.5,
            protocol="RESP / Redis"
        )
    ]

    topology = ServiceTopology(
        nodes=nodes,
        edges=edges,
        blast_radius_service_ids=blast_radius,
        root_cause_service_id=root_cause,
        cascading_failure_active=cascading,
        total_cluster_rps=8400.0
    )
    return topology.model_dump()

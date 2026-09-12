import pytest
from starlette.testclient import TestClient
from app.core.auth_rbac import operator_registry, SRERole, ROLE_PERMISSIONS, security_manager
from app.core.session import current_session, OperatorSession
from app.services.orchestrator import agent_orchestrator
from app.services.audit_ledger import audit_ledger
from main import app

def test_operator_registry_authentication():
    """Verify distinct operator authentication and role mappings."""
    commander = operator_registry.authenticate("token-commander-sarah")
    assert commander is not None
    assert commander.operator_id == "op-sarah-chen"
    assert commander.role == SRERole.SRE_COMMANDER
    assert "Sarah Chen" in commander.name
    assert not commander.revoked

    responder = operator_registry.authenticate("token-responder-alex")
    assert responder is not None
    assert responder.operator_id == "op-alex-rivera"
    assert responder.role == SRERole.INCIDENT_RESPONDER
    assert "Alex Rivera" in responder.name

    observer = operator_registry.authenticate("token-observer-jordan")
    assert observer is not None
    assert observer.operator_id == "op-jordan-lee"
    assert observer.role == SRERole.READ_ONLY_OBSERVER
    assert "Jordan Lee" in observer.name

    invalid = operator_registry.authenticate("invalid-token-1234")
    assert invalid is None

def test_session_endpoint_individual_identities():
    """Test login via /api/session returning distinct operator identity and RBAC permissions."""
    client = TestClient(app, base_url="http://localhost:8000")

    # 1. Login as Sarah (Commander)
    resp = client.post("/api/session", json={"access_token": "token-commander-sarah"}, headers={"Origin": "http://localhost:8000"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["operator_id"] == "op-sarah-chen"
    assert data["role"] == "SRE_COMMANDER"
    assert "restart_pod" in data["permissions"]
    assert "scale_replicas" in data["permissions"]
    assert "get_cluster_health" in data["permissions"]

    # 2. Login as Alex (Responder)
    resp = client.post("/api/session", json={"access_token": "token-responder-alex"}, headers={"Origin": "http://localhost:8000"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["operator_id"] == "op-alex-rivera"
    assert data["role"] == "INCIDENT_RESPONDER"
    assert "scale_replicas" in data["permissions"]
    assert "restart_pod" not in data["permissions"]

    # 3. Login as Jordan (Observer)
    resp = client.post("/api/session", json={"access_token": "token-observer-jordan"}, headers={"Origin": "http://localhost:8000"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["operator_id"] == "op-jordan-lee"
    assert data["role"] == "READ_ONLY_OBSERVER"
    assert "restart_pod" not in data["permissions"]
    assert "scale_replicas" not in data["permissions"]
    assert "get_cluster_health" in data["permissions"]

    # 4. Invalid token rejected
    resp = client.post("/api/session", json={"access_token": "bad-token"}, headers={"Origin": "http://localhost:8000"})
    assert resp.status_code == 401

def test_rbac_permission_boundaries_orchestration():
    """Enforce complete mediation: Observer cannot mutate, Responder has bounded actions, Commander has full authority."""
    # 1. Observer session
    observer = operator_registry.get_operator("op-jordan-lee")
    obs_session = OperatorSession(
        operator_id=observer.operator_id,
        operator=observer.name,
        role=observer.role.value,
        authenticated=True
    )
    token = current_session.set(obs_session)
    try:
        spoken, result = agent_orchestrator._stage_remediation("restart_pod", "payment-service", {})
        assert result.get("status") == "denied" or not result.get("success", True)
        assert "permission" in spoken.lower() or "denied" in spoken.lower()
    finally:
        current_session.reset(token)

    # 2. Responder session cannot perform destructive restart_pod
    responder = operator_registry.get_operator("op-alex-rivera")
    resp_session = OperatorSession(
        operator_id=responder.operator_id,
        operator=responder.name,
        role=responder.role.value,
        authenticated=True
    )
    token = current_session.set(resp_session)
    try:
        spoken, result = agent_orchestrator._stage_remediation("restart_pod", "payment-service", {})
        assert result.get("status") == "denied" or not result.get("success", True)
    finally:
        current_session.reset(token)

    # 3. Commander session CAN stage restart_pod
    commander = operator_registry.get_operator("op-sarah-chen")
    comm_session = OperatorSession(
        operator_id=commander.operator_id,
        operator=commander.name,
        role=commander.role.value,
        authenticated=True
    )
    token = current_session.set(comm_session)
    try:
        spoken, result = agent_orchestrator._stage_remediation("restart_pod", "payment-service", {})
        assert result.get("status") == "staged"
        assert result.get("operator_id") == "op-sarah-chen"
        assert "Sarah Chen" in result.get("operator_name")
        # Cleanup pending staged action
        agent_orchestrator.cancel_staged_remediation()
    finally:
        current_session.reset(token)

def test_token_revocation_immediacy():
    """Revoking an operator invalidates their session immediately and blocks authentication."""
    # Register a temporary test operator
    operator_registry.register_operator("op-temp-contractor", "Temp Contractor", SRERole.INCIDENT_RESPONDER, "token-contractor-999")
    assert operator_registry.authenticate("token-contractor-999") is not None

    client_comm = TestClient(app, base_url="http://localhost:8000")
    client_comm.post("/api/session", json={"access_token": "token-commander-sarah"}, headers={"Origin": "http://localhost:8000"})

    # Revoke operator via Commander API
    revoke_resp = client_comm.post("/api/operators/revoke", json={"operator_id": "op-temp-contractor"}, headers={"Origin": "http://localhost:8000"})
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["status"] == "revoked"

    # Authenticate fails immediately
    assert operator_registry.authenticate("token-contractor-999") is None
    assert operator_registry.is_revoked("op-temp-contractor") is True

    # Attempt login with revoked token
    client_revoked = TestClient(app, base_url="http://localhost:8000")
    bad_login = client_revoked.post("/api/session", json={"access_token": "token-contractor-999"}, headers={"Origin": "http://localhost:8000"})
    assert bad_login.status_code == 401

def test_non_commander_cannot_revoke_credentials():
    """Observers and Responders are prohibited from revoking operator credentials."""
    client_obs = TestClient(app, base_url="http://localhost:8000")
    client_obs.post("/api/session", json={"access_token": "token-observer-jordan"}, headers={"Origin": "http://localhost:8000"})

    resp = client_obs.post("/api/operators/revoke", json={"operator_id": "op-sarah-chen"}, headers={"Origin": "http://localhost:8000"})
    assert resp.status_code == 403
    assert "Only SRE_COMMANDER" in resp.json()["detail"]

def test_audit_ledger_operator_attribution_and_chain_integrity():
    """Cryptographic audit ledger attributes events to individual operator identities with valid SHA-256 chain."""
    commander = operator_registry.get_operator("op-sarah-chen")
    session = OperatorSession(
        operator_id=commander.operator_id,
        operator=commander.name,
        role=commander.role.value,
        authenticated=True
    )
    token = current_session.set(session)
    try:
        agent_orchestrator.record_turn("user", "Check payment-service health")
        last_block = audit_ledger.blocks[-1]
        assert "Sarah Chen" in last_block["actor"]
        assert "op-sarah-chen" in last_block["actor"]
        assert last_block["role"] == "SRE_COMMANDER"

        valid, count, reason = audit_ledger.verify_chain_integrity()
        assert valid is True
        assert reason is None
        assert count >= 1
    finally:
        current_session.reset(token)

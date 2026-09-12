"""Credential lifecycle regressions: exercise authorization beyond successful login."""
import pytest
from fastapi.testclient import TestClient
from app.core import auth_rbac
from app.core.auth_rbac import OperatorRegistry, SRERole, security_manager
from app.core.config import settings
from app.core.http_session import COOKIE_NAME
from app.core.session import create_session, current_session, find_session
from main import app


@pytest.mark.parametrize('raw', ['token-commander-sarah', 'token-responder-alex', 'token-observer-jordan'])
def test_published_sample_credentials_are_not_installed(raw, monkeypatch):
    monkeypatch.setattr(settings, 'operator_access_token', 'private-test-commander')
    with TestClient(app) as client:
        assert client.post('/api/session', json={'access_token': raw}).status_code == 401


def test_rotation_invalidates_old_token_cookie_and_cached_permissions():
    registry = auth_rbac.operator_registry
    op = registry.register_operator('alice', 'Alice', SRERole.SRE_COMMANDER, 'first-private-token')
    session = create_session(operator=op)
    context = current_session.set(session)
    try:
        assert security_manager.is_action_permitted('restart_pod')
        registry.register_operator('alice', 'Alice', SRERole.SRE_COMMANDER, 'second-private-token')
        assert registry.authenticate('first-private-token') is None
        assert registry.authenticate('second-private-token') is not None
        assert find_session(session.id) is None
        assert not security_manager.is_action_permitted('restart_pod')
        with pytest.raises(ValueError, match='revoked credential'):
            registry.register_operator('alice', 'Alice', SRERole.SRE_COMMANDER, 'first-private-token')
    finally:
        current_session.reset(context)


def test_revocation_persists_and_is_visible_to_another_registry(tmp_path):
    path = tmp_path / 'operators.sqlite3'
    first, second = OperatorRegistry(path), OperatorRegistry(path)
    first.register_operator('alice', 'Alice', SRERole.SRE_COMMANDER, 'private-token')
    assert second.authenticate('private-token') is not None
    second.revoke_operator('alice')
    assert first.authenticate('private-token') is None
    restarted = OperatorRegistry(path)
    assert restarted.authenticate('private-token') is None
    assert restarted.is_revoked('alice')
    assert restarted.get_operator('alice').name == 'Alice'


def test_shared_token_cannot_reassign_identity():
    registry = auth_rbac.operator_registry
    registry.register_operator('alice', 'Alice', SRERole.SRE_COMMANDER, 'private-token')
    with pytest.raises(ValueError, match='shared'):
        registry.register_operator('bob', 'Bob', SRERole.READ_ONLY_OBSERVER, 'private-token')
    assert registry.authenticate('private-token').operator_id == 'alice'


def test_configured_secret_rotation_and_removal(monkeypatch):
    registry = auth_rbac.operator_registry
    monkeypatch.setattr(settings, 'operator_access_token', 'configured-secret-one')
    session = create_session(operator=registry.authenticate('configured-secret-one'))
    monkeypatch.setattr(settings, 'operator_access_token', 'configured-secret-two')
    assert find_session(session.id) is None
    assert registry.authenticate('configured-secret-one') is None
    assert registry.authenticate('configured-secret-two') is not None
    registry.revoke_operator(registry.CONFIGURED_ID)
    assert registry.authenticate('configured-secret-two') is None
    monkeypatch.setattr(settings, 'operator_access_token', 'configured-secret-three')
    assert registry.authenticate('configured-secret-three') is not None
    monkeypatch.setattr(settings, 'operator_access_token', '')
    assert registry.authenticate('configured-secret-three') is None


def test_role_change_invalidates_cached_commander_access():
    registry = auth_rbac.operator_registry
    op = registry.register_operator('alice', 'Alice', SRERole.SRE_COMMANDER, 'private-token')
    session = create_session(operator=op)
    token = current_session.set(session)
    try:
        assert security_manager.is_action_permitted('restart_pod')
        registry.register_operator('alice', 'Alice', SRERole.READ_ONLY_OBSERVER, 'private-token')
        assert not security_manager.is_action_permitted('restart_pod')
        assert security_manager.get_current_permissions() == []
        assert find_session(session.id) is None
    finally:
        current_session.reset(token)


def test_unknown_identity_is_denied(operator_session):
    operator_session.operator_id = 'removed-operator'
    operator_session.authenticated = True
    assert find_session(operator_session.id) is None
    assert not security_manager.is_action_permitted('restart_pod')


def test_authenticated_refresh_preserves_session_and_incident():
    registry = auth_rbac.operator_registry
    registry.register_operator('alice', 'Alice', SRERole.SRE_COMMANDER, 'private-token')
    with TestClient(app) as client:
        assert client.post('/api/session', json={'access_token': 'private-token'}).status_code == 200
        sid = client.cookies.get(COOKIE_NAME)
        find_session(sid).services['retained-evidence'] = {'observation': 'E01'}
        assert client.post('/api/session').status_code == 200
        assert client.cookies.get(COOKIE_NAME) == sid
        assert find_session(sid).services['retained-evidence'] == {'observation': 'E01'}
        registry.revoke_operator('alice')
        assert client.get('/api/state').status_code == 401
        assert client.post('/api/session').status_code == 401


def test_individual_identity_works_in_live_mode_without_shared_secret(monkeypatch):
    registry = auth_rbac.operator_registry
    registry.register_operator('alice', 'Alice', SRERole.READ_ONLY_OBSERVER, 'private-token')
    monkeypatch.setattr(settings, 'infrastructure_mode', 'docker')
    with TestClient(app) as client:
        assert client.post('/api/session', json={'access_token': 'private-token'}).status_code == 200
        assert client.get('/api/operators').status_code == 200


def test_configuring_first_operator_invalidates_anonymous_session(operator_session):
    registry = auth_rbac.operator_registry
    assert find_session(operator_session.id) is not None
    registry.register_operator('alice', 'Alice', SRERole.SRE_COMMANDER, 'private-token')
    assert find_session(operator_session.id) is None


def test_revocation_closes_an_existing_websocket():
    from starlette.websockets import WebSocketDisconnect
    registry = auth_rbac.operator_registry
    registry.register_operator('alice', 'Alice', SRERole.SRE_COMMANDER, 'private-token')
    with TestClient(app, base_url='http://testserver') as client:
        assert client.post('/api/session', json={'access_token': 'private-token'}).status_code == 200
        with client.websocket_connect('/ws/agent', headers={'origin': 'http://testserver'}) as ws:
            registry.revoke_operator('alice')
            with pytest.raises(WebSocketDisconnect) as closed:
                while True:
                    ws.receive_json()
            assert closed.value.code == 4401

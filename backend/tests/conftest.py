"""Isolated sessions and offline providers: tests never operate host infrastructure."""
import subprocess
import pytest
from fastapi.testclient import TestClient
from app.core.config import settings
from app.core.session import OperatorSession, current_session, sessions
from app.core.http_session import COOKIE_NAME
from app.services.lemur_service import lemur_service
from main import app


@pytest.fixture(autouse=True)
def operator_session(monkeypatch):
    for name, value in {
        'infrastructure_mode': 'simulation', 'operator_access_token': '',
        'assemblyai_api_key': '', 'gemini_api_key': '', 'openai_api_key': '',
        'llm_provider': 'mock', 'tts_provider': 'browser', 'cookie_secure': False,
    }.items():
        monkeypatch.setattr(settings, name, value)
    monkeypatch.setattr(lemur_service, 'api_key', '')
    def unexpected_process(*args, **kwargs):
        raise AssertionError('Mock infrastructure subprocesses explicitly in tests')
    monkeypatch.setattr(subprocess, 'run', unexpected_process)
    session = OperatorSession()
    sessions[session.id] = session
    token = current_session.set(session)
    yield session
    current_session.reset(token)
    sessions.clear()


@pytest.fixture
def client(operator_session):
    with TestClient(app, headers={'origin': 'http://testserver'}) as client:
        client.cookies.set(COOKIE_NAME, operator_session.id)
        yield client


@pytest.fixture
def ws_command():
    def send(ws, kind, **args):
        ws.send_json({'type': kind, 'request_id': kind, **args})
        events = []
        for _ in range(100):
            event = ws.receive_json()
            events.append(event)
            if event['type'] == 'command_complete' and event['request_id'] == kind:
                return events
        raise AssertionError('Command never completed')
    return send

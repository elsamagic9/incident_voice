"""Cookie authentication for HTTP and WebSocket, with explicit origin checks."""
from urllib.parse import urlparse
from starlette.requests import HTTPConnection
from starlette.responses import JSONResponse
from app.core.config import settings
from app.core.session import current_session, find_session

COOKIE_NAME = 'incident_voice_session'

def origin_allowed(connection):
    origin = connection.headers.get('origin')
    if not origin:
        return connection.scope['type'] != 'websocket'
    parsed = urlparse(origin)
    if parsed.scheme not in {'http', 'https'} or not parsed.netloc:
        return False
    return origin.rstrip('/') in settings.allowed_origins or parsed.netloc == connection.headers.get('host')

class OperatorSessionMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] not in ('http', 'websocket'):
            return await self.app(scope, receive, send)
        connection = HTTPConnection(scope)
        path = scope.get('path', '')
        protected = path.startswith('/api/') or path == '/ws/agent'
        if not protected or path in {'/api/health', '/api/session'}:
            return await self.app(scope, receive, send)
        session = find_session(connection.cookies.get(COOKIE_NAME))
        valid = session and origin_allowed(connection)
        if settings.operator_access_token and session and not session.authenticated:
            valid = False
        if settings.infrastructure_mode != 'simulation' and (not settings.operator_access_token or not session or not session.authenticated):
            valid = False
        if not valid:
            if scope['type'] == 'websocket':
                return await send({'type': 'websocket.close', 'code': 4401})
            return await JSONResponse({'detail': 'Open an operator session first.'}, status_code=401)(scope, receive, send)
        token = current_session.set(session)
        scope.setdefault('state', {})['operator_session'] = session
        try:
            if scope['type'] == 'http':
                async with session.lock:
                    await self.app(scope, receive, send)
            else:
                await self.app(scope, receive, send)
        finally:
            current_session.reset(token)

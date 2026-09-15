"""AssemblyAI LLM Gateway client that respects the provider's own rate limits.

The Gateway is limited per model, and the limit is far tighter than the generic
account figure: measured against a live key, ``qwen3.5-4b-32k-fast`` allowed two
requests per 60-second window and answered HTTP 429 on the third. Two statements
in the same minute (for example an investigation followed by a report) therefore
exhausts the window.

Callers must never present a local fallback as AI analysis when the provider was
merely rate limited, so this client surfaces the provider's reset window instead
of hiding it. A retry is attempted only when the provider states a short reset.
"""
import asyncio
import httpx
from app.core.config import settings

GATEWAY_CHAT_URL = 'https://llm-gateway.assemblyai.com/v1/chat/completions'

# A rate-limited call still has to answer the operator promptly, so only wait for
# windows short enough to be invisible in a voice turn.
MAX_RATE_LIMIT_WAIT_SECONDS = 20.0


class LLMGatewayError(Exception):
    """Gateway failure that carries the provider's rate-limit guidance."""

    def __init__(self, message, status=None, retry_after_seconds=None):
        super().__init__(message)
        self.status = status
        self.retry_after_seconds = retry_after_seconds

    def describe(self):
        """Operator-facing explanation distinguishing throttling from a real fault."""
        if self.status == 429:
            if self.retry_after_seconds:
                return (f'AssemblyAI rate limit reached; the model allows a few requests per minute. '
                        f'Retry in about {int(self.retry_after_seconds)}s.')
            return 'AssemblyAI rate limit reached. Retry after the provider limit resets.'
        if self.status:
            return f'AssemblyAI LLM Gateway returned HTTP {self.status}.'
        return 'AssemblyAI LLM Gateway request failed.'


class LLMGatewayClient:
    def __init__(self, api_key=None, timeout=30.0):
        self.api_key = settings.assemblyai_api_key if api_key is None else api_key
        self.timeout = timeout

    @property
    def configured(self):
        return bool(self.api_key)

    @staticmethod
    def reset_seconds(response):
        """Seconds until the window resets, when the provider states it."""
        for header in ('Retry-After', 'X-RateLimit-Reset'):
            raw = response.headers.get(header)
            if raw is None:
                continue
            try:
                delay = float(raw)
            except (TypeError, ValueError):
                continue
            if delay > 0:
                return delay
        return None

    async def chat(self, payload, *, max_wait_seconds=MAX_RATE_LIMIT_WAIT_SECONDS):
        """POST a chat completion and return the decoded body."""
        if not self.configured:
            raise LLMGatewayError('AssemblyAI is not configured.')
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for attempt in (0, 1):
                response = await client.post(GATEWAY_CHAT_URL,
                    headers={'Authorization': self.api_key.strip()}, json=payload)
                if response.status_code != 429:
                    try:
                        response.raise_for_status()
                    except httpx.HTTPStatusError as exc:
                        raise LLMGatewayError(f'HTTP {exc.response.status_code}',
                            status=exc.response.status_code) from exc
                    return response.json()
                delay = self.reset_seconds(response)
                if attempt or delay is None or delay > max_wait_seconds:
                    raise LLMGatewayError('Rate limited', status=429, retry_after_seconds=delay)
                await asyncio.sleep(delay)
        raise LLMGatewayError('Rate limited', status=429)

    async def chat_text(self, payload, **kwargs):
        """POST a chat completion and return the assistant message text."""
        body = await self.chat(payload, **kwargs)
        try:
            content = body['choices'][0]['message']['content']
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMGatewayError('No completion text returned.') from exc
        if not isinstance(content, str) or not content.strip():
            raise LLMGatewayError('No completion text returned.')
        return content


llm_gateway = LLMGatewayClient()
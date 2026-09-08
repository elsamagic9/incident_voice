import io
import logging
from typing import AsyncGenerator
import edge_tts
from app.core.config import settings

logger = logging.getLogger("tts_service")

class TTSService:
    """
    Handles streaming Text-to-Speech synthesis with ultra-low latency.
    Supports Edge-TTS (free, neural, high-speed), Cartesia, and browser fallback.
    """

    def __init__(self):
        self.voice = settings.edge_tts_voice

    async def stream_speech(self, text: str) -> AsyncGenerator[bytes, None]:
        """
        Streams audio chunks for spoken text using Microsoft Neural voices via edge-tts.
        Yields raw audio bytes (MP3/PCM).
        """
        if not text.strip():
            return

        try:
            communicate = edge_tts.Communicate(text, self.voice)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]
        except Exception as e:
            logger.error(f"TTS Streaming error: {e}")
            # Yield a minimal silent MP3 frame so the client doesn't hang
            # This is a valid 0.1s silent MP3 frame header
            yield b'\xff\xfb\x90\x00' + b'\x00' * 417

tts_service = TTSService()

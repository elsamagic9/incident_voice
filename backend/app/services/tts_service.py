"""Complete MP3 utterances, with an explicit browser-speech fallback."""
import edge_tts
from app.core.config import settings

class TTSService:
    async def synthesize(self, text):
        if settings.tts_provider == 'browser':
            return {'encoding': 'browser', 'text': text, 'source': 'browser'}
        chunks = []
        try:
            async for chunk in edge_tts.Communicate(text, settings.edge_tts_voice).stream():
                if chunk['type'] == 'audio': chunks.append(chunk['data'])
            if not chunks: raise RuntimeError('No audio returned')
            return {'encoding': 'mp3', 'audio': b''.join(chunks), 'source': 'edge-tts'}
        except Exception:
            return {'encoding': 'browser', 'text': text, 'source': 'browser', 'warning': 'Edge-TTS unavailable; using browser speech.'}

tts_service = TTSService()

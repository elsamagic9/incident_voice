import re
import edge_tts
from app.core.config import settings

def clean_speech_text(text: str) -> str:
    # Remove code blocks
    text = re.sub(r'```.*?```', '', text, flags=re.DOTALL)
    # Remove inline code
    text = re.sub(r'`([^`]+)`', r'\1', text)
    # Remove markdown headers
    text = re.sub(r'^#+\s*', '', text, flags=re.MULTILINE)
    # Remove bullet points
    text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)
    # Remove markdown links [label](url) -> label
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    # Remove markdown bold/italic (handles hyphens, dots, punctuation inside or adjacent)
    text = re.sub(r'\*{1,3}(.+?)\*{1,3}', r'\1', text)
    text = re.sub(r'_{1,3}(.+?)_{1,3}', r'\1', text)
    # Remove stray markdown symbols
    text = text.replace('*', '').replace('#', '')
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

class TTSService:
    async def synthesize(self, text):
        clean_text = clean_speech_text(text)
        if not clean_text:
            clean_text = 'Code is available in the transcript.'
        if settings.tts_provider == 'browser':
            return {'encoding': 'browser', 'text': clean_text, 'source': 'browser'}
        chunks = []
        try:
            async for chunk in edge_tts.Communicate(clean_text, settings.edge_tts_voice).stream():
                if chunk['type'] == 'audio': chunks.append(chunk['data'])
            if not chunks: raise RuntimeError('No audio returned')
            return {'encoding': 'mp3', 'audio': b''.join(chunks), 'source': 'edge-tts'}
        except Exception:
            return {'encoding': 'browser', 'text': clean_text, 'source': 'browser', 'warning': 'Edge-TTS unavailable; using browser speech.'}

tts_service = TTSService()

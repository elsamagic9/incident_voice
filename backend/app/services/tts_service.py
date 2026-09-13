import re
import edge_tts
from app.core.config import settings

def clean_speech_text(text: str) -> str:
    # Remove code blocks and inline code
    text = re.sub(r'```.*?```', '', text, flags=re.DOTALL)
    text = re.sub(r'`([^`]+)`', r'\1', text)

    # Remove markdown tables completely (rows with multiple | or divider rows)
    lines = []
    for line in text.splitlines():
        trimmed = line.strip()
        if trimmed.startswith('|') or re.match(r'^\|?[-:\s|]+\|?$', trimmed) or (trimmed.count('|') >= 2):
            continue
        lines.append(line)
    text = '\n'.join(lines)

    # Convert flow arrows and diagrams to spoken English
    text = re.sub(r'[→←↔⇒➔➜]', ' to ', text)
    text = re.sub(r'-->|->|==>|=>', ' to ', text)

    # Remove emojis and miscellaneous non-verbal symbols
    text = re.sub(r'[\U00010000-\U0010ffff]', '', text)
    text = re.sub(r'[\u2000-\u3300]', ' ', text)

    # Remove markdown headers and bullet points
    text = re.sub(r'^#+\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)

    # Remove markdown links [label](url) -> label
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)

    # Remove markdown bold/italic
    text = re.sub(r'\*{1,3}(.+?)\*{1,3}', r'\1', text)
    text = re.sub(r'_{1,3}(.+?)_{1,3}', r'\1', text)

    # Remove stray markdown symbols and pipes
    text = text.replace('*', '').replace('#', '').replace('|', ' ')

    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    # Distill long technical responses so speech stays punchy and conversational
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]
    if len(sentences) > 4:
        speech = ' '.join(sentences[:3])
        last = sentences[-1]
        if '?' in last or any(w in last.lower() for w in ['shall i', 'would you like', 'recommend', 'proceed', 'investigate']):
            speech += ' ' + last
        text = speech

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

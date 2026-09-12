"""Session-only recording of received PCM audio and actual transcript events."""
import array
import secrets
import io
import sys
import time
import wave
from app.core.session import SessionLocal
from app.core.state import cluster_state

class BlackBoxService:
    SAMPLE_RATE = 24000
    MAX_SECONDS = 600

    def __init__(self): self.reset()

    def reset(self):
        self.recording_id = secrets.token_hex(16)
        self.started_at = time.time()
        self.events = []
        self.next_event_id = 0
        self.chunks = []
        self.track_ends = {}
        self.sample_count = 0
        self.recording_limited = False

    def record_event(self, speaker, text, event_type='voice', is_key_milestone=False):
        self.events.append({'id': f'event-{self.next_event_id}', 'time_seconds': round(time.time()-self.started_at, 2),
            'speaker': speaker, 'transcript': text, 'event_type': event_type, 'is_key_milestone': is_key_milestone})
        self.events = self.events[-1000:]
        self.next_event_id += 1

    def record_audio(self, pcm, sample_rate, speaker='user'):
        if len(pcm) % 2 or sample_rate not in (16000, 24000): return
        if self.sample_count + len(pcm)//2 > self.SAMPLE_RATE*self.MAX_SECONDS*2:
            self.recording_limited = True
            return
        samples = array.array('h')
        samples.frombytes(pcm)
        if sys.byteorder != 'little': samples.byteswap()
        if sample_rate != self.SAMPLE_RATE and samples:
            samples = array.array('h', (samples[min(len(samples)-1, int(i*sample_rate/self.SAMPLE_RATE))] for i in range(round(len(samples)*self.SAMPLE_RATE/sample_rate))))
        offset = max(0, int((time.time()-self.started_at)*self.SAMPLE_RATE))
        if speaker == 'agent': offset = max(offset, self.track_ends.get(speaker, 0))
        if offset >= self.SAMPLE_RATE*self.MAX_SECONDS:
            self.recording_limited = True
            return
        samples = samples[:self.SAMPLE_RATE*self.MAX_SECONDS-offset]
        self.chunks.append((offset, samples, speaker))
        self.track_ends[speaker] = offset + len(samples)
        self.sample_count += len(samples)

    def get_blackbox_data(self):
        duration = max(self.track_ends.values(), default=0) / self.SAMPLE_RATE
        peaks = [0.0]*100
        for offset, samples, _ in self.chunks:
            if samples and duration:
                index = min(99, int(offset / (duration*self.SAMPLE_RATE) * 100))
                peaks[index] = max(peaks[index], max(abs(s) for s in samples[::64]) / 32768)
        markers = [{**e, 'time_label': f'{int(e["time_seconds"])//60:02d}:{int(e["time_seconds"])%60:02d}'} for e in self.events]
        return {'incident_id': cluster_state.incident.id, 'total_duration_seconds': round(duration, 2),
                'audio_url': '/api/incident/blackbox/audio.wav' if self.chunks else None,
                'recorded_tracks': sorted(self.track_ends), 'source': 'captured_audio',
                'recording_limited': self.recording_limited, 'waveform_peaks': peaks, 'markers': markers}

    def generate_wav(self):
        if not self.chunks: return b''
        size = max(offset+len(samples) for offset, samples, _ in self.chunks)
        mixed = array.array('h', [0])*size
        for offset, samples, _ in self.chunks:
            for i, value in enumerate(samples):
                mixed[offset+i] = max(-32768, min(32767, mixed[offset+i]+value))
        if sys.byteorder != 'little': mixed.byteswap()
        result = io.BytesIO()
        with wave.open(result, 'wb') as wav:
            wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(self.SAMPLE_RATE); wav.writeframes(mixed.tobytes())
        return result.getvalue()

blackbox_service = SessionLocal('blackbox', BlackBoxService)

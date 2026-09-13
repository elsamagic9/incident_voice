import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioChunk {
  encoding: 'pcm_s16le' | 'mp3' | 'browser';
  data?: string;
  text?: string;
  sample_rate?: number;
}

export function useAudioPlayer(onError?: (message: string) => void) {
  const context = useRef<AudioContext | null>(null);
  const sources = useRef(new Set<AudioBufferSourceNode>());
  const generation = useRef(0);
  const playhead = useRef(0);
  const pending = useRef(Promise.resolve());
  const [isPlaying, setIsPlaying] = useState(false);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  const getAudioContext = useCallback(() => {
    if (!context.current || context.current.state === 'closed') context.current = new AudioContext();
    void context.current.resume().catch(() => errorRef.current?.('Click the sound button to allow audio playback.'));
    return context.current;
  }, []);

  const stopPlayback = useCallback(() => {
    generation.current++;
    for (const source of sources.current) {
      source.onended = null;
      try { source.stop(); source.disconnect(); } catch { /* Already stopped. */ }
    }
    sources.current.clear();
    window.speechSynthesis?.cancel();
    playhead.current = 0;
    pending.current = Promise.resolve();
    setIsPlaying(false);
  }, []);

  const enqueueAudio = useCallback((chunk: AudioChunk) => {
    const epoch = generation.current;
    if (chunk.encoding === 'browser') {
      if (!window.speechSynthesis || !chunk.text) {
        errorRef.current?.('Speech playback is unavailable in this browser. The response is available in the transcript.');
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.rate = 1.02;
      utterance.onstart = () => { if (generation.current === epoch) setIsPlaying(true); };
      utterance.onend = () => { if (generation.current === epoch) setIsPlaying(false); };
      utterance.onerror = (event) => {
        if (generation.current !== epoch) return;
        setIsPlaying(false);
        if (!['canceled', 'interrupted'].includes(event.error)) errorRef.current?.('Browser speech failed. Read the response in the transcript.');
      };
      window.speechSynthesis.speak(utterance);
      return;
    }
    pending.current = pending.current.then(async () => {
      if (generation.current !== epoch || !chunk.data) return;
      const ctx = getAudioContext();
      const bytes = Uint8Array.from(atob(chunk.data), c => c.charCodeAt(0));
      let buffer: AudioBuffer;
      if (chunk.encoding === 'mp3') {
        buffer = await ctx.decodeAudioData(bytes.buffer);
      } else if (chunk.encoding === 'pcm_s16le') {
        if (bytes.length % 2 || !chunk.sample_rate) throw new Error('Invalid PCM frame');
        buffer = ctx.createBuffer(1, bytes.length / 2, chunk.sample_rate);
        const view = new DataView(bytes.buffer);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < channel.length; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
      } else throw new Error('Unsupported audio format');
      if (generation.current !== epoch) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      sources.current.add(source);
      source.onended = () => {
        sources.current.delete(source);
        source.disconnect();
        if (!sources.current.size && generation.current === epoch) setIsPlaying(false);
      };
      const now = ctx.currentTime;
      const start = playhead.current > now ? playhead.current : now + 0.005;
      playhead.current = start + buffer.duration;
      source.start(start);
      setIsPlaying(true);
    }).catch(() => {
      if (generation.current === epoch) errorRef.current?.('Could not decode speech audio. The response is available in the transcript.');
    });
  }, [getAudioContext]);

  useEffect(() => () => {
    stopPlayback();
    const ctx = context.current;
    context.current = null;
    if (ctx && ctx.state !== 'closed') void ctx.close();
  }, [stopPlayback]);

  return { enqueueAudio, stopPlayback, getAudioContext, isPlaying };
}

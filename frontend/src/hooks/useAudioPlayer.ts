import { useRef, useCallback } from 'react';

export function useAudioPlayer() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioCtx();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const playNextChunk = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const ctx = getAudioContext();
    const arrayBuffer = audioQueueRef.current.shift()!;

    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      currentSourceRef.current = source;

      source.onended = () => {
        playNextChunk();
      };

      source.start(0);
    } catch (err) {
      // Decode error or abort
      playNextChunk();
    }
  }, [getAudioContext]);

  const enqueueBase64Chunk = useCallback(async (base64String: string) => {
    try {
      const binaryString = window.atob(base64String);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      audioQueueRef.current.push(bytes.buffer);
      if (!isPlayingRef.current) {
        playNextChunk();
      }
    } catch (err) {
      console.error('Failed to parse audio chunk:', err);
    }
  }, [playNextChunk]);

  const stopPlayback = useCallback(() => {
    // Instant Barge-In mute
    audioQueueRef.current = [];
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch (e) {}
      currentSourceRef.current = null;
    }
    isPlayingRef.current = false;
  }, []);

  return {
    enqueueBase64Chunk,
    stopPlayback,
    getAudioContext
  };
}

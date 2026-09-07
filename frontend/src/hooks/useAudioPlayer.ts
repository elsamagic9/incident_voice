import { useRef, useCallback, useEffect } from 'react';

/**
 * High-performance Web Audio playback hook.
 * Reliably handles:
 *  1. Raw PCM16 audio chunks (from AssemblyAI Voice Agent API)
 *  2. Containerized MP3 / WAV audio chunks (from Edge-TTS / Neural TTS)
 *  3. Instant barge-in cancellation and queue flushing
 *  4. Browser autoplay policy auto-resume on first interaction
 */
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
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }, []);

  // Browser Autoplay Policy listener: auto-resume AudioContext on first user touch/click/key
  useEffect(() => {
    const handleFirstGesture = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', handleFirstGesture, { passive: true });
    window.addEventListener('keydown', handleFirstGesture, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
  }, []);

  /**
   * Converts raw linear PCM16 ArrayBuffer into a playable AudioBuffer.
   */
  const pcm16ToAudioBuffer = (ctx: AudioContext, arrayBuffer: ArrayBuffer, sampleRate = 16000): AudioBuffer => {
    const int16Array = new Int16Array(arrayBuffer);
    const audioBuffer = ctx.createBuffer(1, int16Array.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < int16Array.length; i++) {
      channelData[i] = int16Array[i] / 32768.0;
    }
    return audioBuffer;
  };

  /**
   * Determines if the buffer contains containerized audio headers (RIFF/WAV or MP3 sync/ID3).
   */
  const isContainerizedAudio = (bytes: Uint8Array): boolean => {
    if (bytes.length < 4) return false;
    // RIFF (WAV) header
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      return true;
    }
    // ID3 (MP3) header
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      return true;
    }
    // MP3 Frame Sync: 11 bits set (0xFF followed by 0xEx)
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
      return true;
    }
    return false;
  };

  const playNextChunk = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const ctx = getAudioContext();
    const arrayBuffer = audioQueueRef.current.shift()!;
    const bytes = new Uint8Array(arrayBuffer);

    let audioBuffer: AudioBuffer | null = null;

    try {
      if (isContainerizedAudio(bytes)) {
        // Decode containerized MP3 or WAV
        audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      } else {
        // Raw linear PCM16 from Voice Agent API
        audioBuffer = pcm16ToAudioBuffer(ctx, arrayBuffer, 16000);
      }
    } catch (err) {
      // Fallback attempt: if decodeAudioData failed, try PCM16 interpretation
      try {
        audioBuffer = pcm16ToAudioBuffer(ctx, arrayBuffer, 16000);
      } catch (fallbackErr) {
        audioBuffer = null;
      }
    }

    if (!audioBuffer) {
      playNextChunk();
      return;
    }

    try {
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      currentSourceRef.current = source;

      source.onended = () => {
        playNextChunk();
      };

      source.start(0);
    } catch (err) {
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

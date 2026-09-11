import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceStream } from '../src/hooks/useVoiceStream';

const audio = vi.hoisted(() => ({
  isPlaying: false, stopPlayback: vi.fn(), enqueueAudio: vi.fn(), getAudioContext: vi.fn(),
}));
vi.mock('../src/hooks/useAudioPlayer', () => ({ useAudioPlayer: () => audio }));

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor() { Socket.instances.push(this); }
  emit(data: object) { this.onmessage?.({ data: JSON.stringify(data) }); }
}

beforeEach(() => {
  Socket.instances = [];
  audio.isPlaying = false;
  vi.clearAllMocks();
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    operator: 'Demo operator', role: 'SRE_COMMANDER', infrastructure_mode: 'simulation',
  }) }));
});

async function ready() {
  const hook = renderHook(() => useVoiceStream());
  await waitFor(() => expect(Socket.instances).toHaveLength(1));
  const socket = Socket.instances[0];
  act(() => socket.onopen?.());
  return { ...hook, socket };
}

describe('Voice connection lifecycle', () => {
  it('interrupts current playback without recreating the socket when playback changes', async () => {
    const { socket, rerender } = await ready();
    audio.isPlaying = true;
    rerender();
    act(() => socket.emit({ type: 'turn', speaker: 'user', transcript: 'stop', end_of_turn: false }));
    expect(socket.send.mock.calls.map(([value]) => JSON.parse(value))).toContainEqual(expect.objectContaining({ type: 'barge_in' }));
    expect(Socket.instances).toHaveLength(1);
    expect(audio.stopPlayback).toHaveBeenCalled();
    audio.isPlaying = false;
    rerender();
    socket.send.mockClear();
    act(() => socket.emit({ type: 'turn', speaker: 'user', transcript: 'check health', end_of_turn: true }));
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('ignores stale audio and resumes only audio from the current response', async () => {
    const { socket } = await ready();
    act(() => socket.emit({ type: 'interrupt', epoch: 2 }));
    act(() => socket.emit({ type: 'audio_stream', epoch: 1, encoding: 'browser', text: 'old' }));
    expect(audio.enqueueAudio).not.toHaveBeenCalled();
    act(() => socket.emit({ type: 'audio_stream', epoch: 2, encoding: 'browser', text: 'current' }));
    expect(audio.enqueueAudio).toHaveBeenCalledWith(expect.objectContaining({ text: 'current' }));
  });

  it('removes reconnect handlers before intentional unmount', async () => {
    const { socket, unmount } = await ready();
    unmount();
    expect(socket.onclose).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it('switches engines on the existing connection', async () => {
    const { socket, result } = await ready();
    act(() => result.current.selectEngine('voice_agent_api'));
    act(() => socket.emit({ type: 'engine_sync', engine: 'voice_agent_api' }));
    expect(result.current.activeEngine).toBe('voice_agent_api');
    expect(Socket.instances).toHaveLength(1);
    expect(socket.close).not.toHaveBeenCalled();
  });
});

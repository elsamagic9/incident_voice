import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';

let context: FakeAudioContext;
class FakeAudioContext {
  state = 'running';
  currentTime = 1;
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
  decodeAudioData = vi.fn();
  createBuffer = vi.fn((_channels: number, samples: number, rate: number) => {
    const values = new Float32Array(samples);
    return { duration: samples / rate, getChannelData: () => values };
  });
  createBufferSource = vi.fn(() => ({ buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null }));
  constructor() { context = this; }
}
beforeEach(() => { vi.stubGlobal('AudioContext', FakeAudioContext); });

it('does not reinterpret compressed bytes when MP3 decoding fails', async () => {
  const error = vi.fn();
  const { result } = renderHook(() => useAudioPlayer(error));
  act(() => result.current.getAudioContext());
  context.decodeAudioData.mockRejectedValue(new Error('bad mp3'));
  act(() => result.current.enqueueAudio({ encoding: 'mp3', data: btoa('broken compressed audio') }));
  await waitFor(() => expect(error).toHaveBeenCalled());
  expect(context.createBuffer).not.toHaveBeenCalled();
  expect(context.createBufferSource).not.toHaveBeenCalled();
});

it('discards audio that finishes decoding after the operator interrupts', async () => {
  const { result } = renderHook(() => useAudioPlayer());
  act(() => result.current.getAudioContext());
  let complete!: (value: unknown) => void;
  context.decodeAudioData.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  act(() => result.current.enqueueAudio({ encoding: 'mp3', data: btoa('test') }));
  await waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce());
  act(() => result.current.stopPlayback());
  await act(async () => complete({ duration: 1 }));
  expect(context.createBufferSource).not.toHaveBeenCalled();
  expect(result.current.isPlaying).toBe(false);
});

it('plays little-endian signed PCM at the provider sample rate', async () => {
  const { result } = renderHook(() => useAudioPlayer());
  act(() => result.current.enqueueAudio({ encoding: 'pcm_s16le', sample_rate: 24000, data: btoa(String.fromCharCode(0, 128, 255, 127)) }));
  await waitFor(() => expect(result.current.isPlaying).toBe(true));
  expect(context.createBuffer).toHaveBeenCalledWith(1, 2, 24000);
  const buffer = context.createBuffer.mock.results[0].value;
  expect(buffer.getChannelData()[0]).toBe(-1);
  expect(buffer.getChannelData()[1]).toBeCloseTo(1, 3);
});

/**
 * AudioWorkletProcessor for high-performance, glitch-free audio capture.
 * Runs on the dedicated Web Audio rendering thread (off main thread).
 * Downsamples input to 16,000 Hz, 16-bit linear PCM (mono).
 */

class PcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetSampleRate = options.processorOptions?.targetSampleRate || 16000;
    this.bufferSize = Math.round(this.targetSampleRate * 0.064); // 64ms frames, engine-specific rate
    this.buffer = new Int16Array(this.bufferSize);
    this.bufferIndex = 0;
    this.step = sampleRate / this.targetSampleRate;
    this.sourceIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    let sum = 0;
    const len = channelData.length;
    for (let i = 0; i < len; i++) {
      sum += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sum / len);

    while (this.sourceIndex < len) {
      const idx = Math.floor(this.sourceIndex);
      const nextIdx = Math.min(idx + 1, len - 1);
      const frac = this.sourceIndex - idx;
      const s0 = channelData[idx];
      const s1 = channelData[nextIdx];
      const interpolated = s0 + frac * (s1 - s0);
      const sample = Math.max(-1, Math.min(1, interpolated));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;

      this.buffer[this.bufferIndex++] = int16;

      if (this.bufferIndex >= this.bufferSize) {
        const out = new Int16Array(this.buffer);
        this.port.postMessage({
          type: 'pcm_chunk',
          buffer: out.buffer,
          volume: rms
        }, [out.buffer]);

        this.buffer = new Int16Array(this.bufferSize);
        this.bufferIndex = 0;
      }

      this.sourceIndex += this.step;
    }

    this.sourceIndex -= len;
    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);

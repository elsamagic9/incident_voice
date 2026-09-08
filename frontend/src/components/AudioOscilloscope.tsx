import React, { useRef, useEffect } from 'react';

interface Props {
  isRecording: boolean;
  audioLevel: number;
  agentSpeaking: boolean;
  className?: string;
  compact?: boolean;
}

export const AudioOscilloscope: React.FC<Props> = ({
  isRecording,
  audioLevel,
  agentSpeaking,
  className = '',
  compact = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let phase = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const render = () => {
      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width === 0 || height === 0) {
        animationId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const isActive = isRecording || agentSpeaking;
      const currentLevel = isActive ? Math.max(0.25, audioLevel * 1.6, agentSpeaking ? 0.75 : 0) : 0.05;

      // Draw subtle grid guides
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Fluid Aurora Glow Fill for the primary harmonic
      if (isActive) {
        ctx.beginPath();
        const fillGradient = ctx.createLinearGradient(0, 0, 0, height);
        if (agentSpeaking) {
          fillGradient.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
          fillGradient.addColorStop(0.5, 'rgba(16, 185, 129, 0.08)');
          fillGradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
        } else {
          fillGradient.addColorStop(0, 'rgba(6, 182, 212, 0.3)');
          fillGradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.12)');
          fillGradient.addColorStop(1, 'rgba(6, 182, 212, 0)');
        }

        ctx.moveTo(0, height / 2);
        for (let x = 0; x <= width; x += 3) {
          const envelope = Math.sin((x / width) * Math.PI);
          const y = height / 2 + Math.sin(x * 0.022 + phase) * (height * 0.42) * currentLevel * envelope;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = fillGradient;
        ctx.fill();
      }

      // Multi-layer sine harmonics with neon glow
      const waveCount = 4;
      for (let i = 0; i < waveCount; i++) {
        ctx.beginPath();
        let strokeColor = '';
        if (agentSpeaking) {
          strokeColor = i === 0 ? 'rgba(52, 211, 153, 0.95)' : `rgba(16, 185, 129, ${0.65 - i * 0.14})`;
        } else if (isRecording) {
          strokeColor = i === 0 ? 'rgba(103, 232, 249, 0.95)' : i === 1 ? 'rgba(129, 140, 248, 0.7)' : `rgba(6, 182, 212, ${0.5 - i * 0.1})`;
        } else {
          strokeColor = `rgba(148, 163, 184, ${0.15 - i * 0.03})`;
        }

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = i === 0 ? 2.5 : 1.5;

        const freq = 0.022 + i * 0.011;
        const amp = (height * 0.38) * currentLevel * (1 - i * 0.17);

        for (let x = 0; x <= width; x += 3) {
          const envelope = Math.sin((x / width) * Math.PI);
          const y = height / 2 + Math.sin(x * freq + phase + i * 1.3) * amp * envelope;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      phase += isActive ? 0.095 : 0.02;
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      ro.disconnect();
    };
  }, [isRecording, audioLevel, agentSpeaking]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-xl border border-white/[0.08] bg-slate-950/70 backdrop-blur-md flex items-center shadow-inner ${
        compact ? 'h-10' : 'h-14'
      } ${className}`}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
      
      {/* Left Status Label */}
      <div className="absolute top-1.5 left-3 flex items-center gap-1.5 text-[10px] font-mono tracking-wider uppercase pointer-events-none select-none">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            agentSpeaking
              ? 'bg-emerald-400 animate-ping'
              : isRecording
              ? 'bg-cyan-400 animate-ping'
              : 'bg-slate-600'
          }`}
        />
        <span className={agentSpeaking ? 'text-emerald-400 font-semibold drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : isRecording ? 'text-cyan-300 font-semibold drop-shadow-[0_0_8px_rgba(103,232,249,0.5)]' : 'text-slate-500'}>
          {agentSpeaking ? 'Synthesis Stream (Edge-TTS)' : isRecording ? 'Live 16kHz PCM Stream' : 'Acoustic Standby'}
        </span>
      </div>

      {/* Right Telemetry / Level Indicator */}
      {(isRecording || agentSpeaking) && (
        <div className="absolute top-1.5 right-3 flex items-center gap-1.5 text-[10px] font-mono pointer-events-none select-none">
          <div className="flex items-center gap-0.5">
            <span className={`w-1 h-2 rounded-full ${audioLevel > 0.1 ? 'bg-cyan-400' : 'bg-slate-700'}`} />
            <span className={`w-1 h-2.5 rounded-full ${audioLevel > 0.3 ? 'bg-cyan-400' : 'bg-slate-700'}`} />
            <span className={`w-1 h-3 rounded-full ${audioLevel > 0.5 ? 'bg-cyan-300' : 'bg-slate-700'}`} />
            <span className={`w-1 h-3.5 rounded-full ${audioLevel > 0.7 ? 'bg-emerald-400' : 'bg-slate-700'}`} />
            <span className={`w-1 h-4 rounded-full ${audioLevel > 0.85 ? 'bg-amber-400' : 'bg-slate-700'}`} />
          </div>
          <span className="text-[9px] text-slate-400">
            {agentSpeaking ? 'ACTIVE OUT' : '16 kHz'}
          </span>
        </div>
      )}
    </div>
  );
};

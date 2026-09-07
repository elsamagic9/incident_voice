import React, { useRef, useEffect } from 'react';

interface Props {
  isRecording: boolean;
  audioLevel: number;
  agentSpeaking: boolean;
}

export const AudioOscilloscope: React.FC<Props> = ({
  isRecording,
  audioLevel,
  agentSpeaking
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let phase = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const isActive = isRecording || agentSpeaking;
      const currentLevel = isActive ? Math.max(0.15, audioLevel, agentSpeaking ? 0.6 : 0) : 0.05;

      // Draw horizontal reference center line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)';
      ctx.lineWidth = 1;
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Multi-layer sine waves
      const waveCount = 3;
      for (let i = 0; i < waveCount; i++) {
        ctx.beginPath();
        const color = agentSpeaking
          ? `rgba(16, 185, 129, ${0.4 - i * 0.1})` // Emerald when agent speaks
          : isRecording
          ? `rgba(6, 182, 212, ${0.5 - i * 0.12})`  // Cyan when user speaks
          : `rgba(71, 85, 105, 0.2)`;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        const freq = 0.02 + i * 0.015;
        const amp = (height * 0.35) * currentLevel * (1 - i * 0.2);

        for (let x = 0; x < width; x += 2) {
          const y = height / 2 + Math.sin(x * freq + phase + i) * amp * Math.sin((x / width) * Math.PI);
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      phase += isActive ? 0.08 : 0.02;
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isRecording, audioLevel, agentSpeaking]);

  return (
    <div className="relative w-full h-16 bg-[#0a0d14] rounded-lg border border-slate-800 overflow-hidden flex items-center">
      <canvas
        ref={canvasRef}
        width={400}
        height={64}
        className="w-full h-full object-cover"
      />
      <div className="absolute top-1.5 left-2 flex items-center gap-1.5 text-[10px] font-mono tracking-wider text-slate-500 uppercase">
        <span className={`w-1.5 h-1.5 rounded-full ${agentSpeaking ? 'bg-emerald-400 animate-pulse' : isRecording ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
        {agentSpeaking ? 'Agent Voice Synthesis' : isRecording ? 'Live Mic 16kHz PCM Stream' : 'Oscilloscope Standby'}
      </div>
    </div>
  );
};

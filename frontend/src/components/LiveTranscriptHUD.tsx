import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Send, User, Bot, Sparkles, VolumeX, Radio, Zap } from 'lucide-react';
import { Turn, AgentStatus } from '../types';
import { AudioOscilloscope } from './AudioOscilloscope';

interface Props {
  turns: Turn[];
  interimTranscript: string;
  isRecording: boolean;
  audioLevel?: number;
  agentStatus: AgentStatus;
  onToggleRecording: () => void;
  onSendText: (text: string) => void;
  onBargeIn: () => void;
}

export const LiveTranscriptHUD: React.FC<Props> = ({
  turns,
  interimTranscript,
  isRecording,
  audioLevel = 0,
  agentStatus,
  onToggleRecording,
  onSendText,
  onBargeIn
}) => {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [turns, interimTranscript]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendText(inputText.trim());
      setInputText('');
    }
  };

  const samplePrompts = [
    "What alerts are firing right now?",
    "Inspect logs for payment-service",
    "Scale payment-service to 5 replicas",
    "Restart failing pods for payment-service",
    "Wrap up incident and generate post-mortem"
  ];

  const getStatusBadge = () => {
    switch (agentStatus) {
      case 'speaking':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 glow-green animate-pulse">
            <Radio className="w-3 h-3 text-emerald-400" /> SPEAKING
          </span>
        );
      case 'thinking':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 glow-cyan animate-pulse">
            <Zap className="w-3 h-3 text-cyan-400" /> REASONING
          </span>
        );
      case 'listening':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-red-500/20 text-red-300 border border-red-500/50 glow-red">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" /> LISTENING
          </span>
        );
      case 'awaiting_confirmation':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/60 glow-amber animate-pulse">
            LOCKED
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono text-slate-400 bg-slate-800/80 border border-white/[0.08]">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> STANDBY
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full glass-panel rounded-2xl overflow-hidden shadow-2xl border border-white/[0.08]">
      {/* HUD Header */}
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between bg-slate-900/50 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/40 text-cyan-400 shadow-inner">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-100 block font-sans">
              Voice Commander Terminal
            </span>
            <span className="text-[10px] font-mono text-slate-400">Universal-3.5 Pro · 16kHz Duplex · JSON-Schema</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {getStatusBadge()}
          {agentStatus === 'speaking' && (
            <button
              onClick={onBargeIn}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition shadow-sm"
              title="Interrupt speech (Barge-In)"
            >
              <VolumeX className="w-3 h-3" /> Interrupt
            </button>
          )}
        </div>
      </div>

      {/* Integrated Audio Oscilloscope Strip */}
      <div className="px-3 pt-2.5 pb-1">
        <AudioOscilloscope
          isRecording={isRecording}
          audioLevel={audioLevel}
          agentSpeaking={agentStatus === 'speaking'}
          compact={true}
        />
      </div>

      {/* Message Stream */}
      <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 font-sans text-sm">
        {turns.length === 0 && !interimTranscript && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-xl glow-cyan">
                <Mic className="w-8 h-8 animate-bounce" />
              </div>
              <div className="absolute inset-0 rounded-2xl border border-cyan-400/40 pulse-ring pointer-events-none" />
            </div>
            <p className="font-bold text-white text-base tracking-tight">Voice Triage Commander Ready</p>
            <p className="text-xs text-slate-400 mt-1.5 max-w-xs leading-relaxed">
              Click the microphone to speak naturally in real-time, or choose any operational runbook prompt below.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                16kHz PCM Full Duplex
              </span>
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30">
                Barge-In Enabled
              </span>
            </div>
          </div>
        )}

        {turns.map((turn) => (
          <div
            key={turn.id}
            className={`flex gap-3 ${turn.speaker === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}
          >
            {turn.speaker !== 'user' && (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-950 to-slate-900 border border-cyan-500/40 flex items-center justify-center flex-shrink-0 text-cyan-400 shadow-md">
                <Bot className="w-4 h-4" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed text-sm shadow-md transition-all ${
                turn.speaker === 'user'
                  ? 'bg-gradient-to-br from-cyan-600 via-cyan-600 to-blue-600 text-white border border-cyan-400/30 shadow-lg shadow-cyan-950/40 rounded-br-xs'
                  : 'glass-panel-subtle text-slate-100 border border-white/[0.08] rounded-bl-xs shadow-lg'
              }`}
            >
              <div className="text-[10px] font-mono opacity-80 mb-1 flex items-center justify-between gap-4">
                <span className="font-bold tracking-wider">{turn.speaker === 'user' ? 'SRE COMMANDER' : 'INCIDENTVOICE CORE'}</span>
                {turn.confidence && <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-950/50 font-semibold text-cyan-300">{(turn.confidence * 100).toFixed(0)}% confidence</span>}
              </div>
              <p className="text-[13px] leading-relaxed select-text">{turn.transcript}</p>
            </div>
            {turn.speaker === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-slate-800 border border-white/[0.1] flex items-center justify-center flex-shrink-0 text-cyan-300 shadow-md">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {/* Interim Streaming Speech HUD */}
        {interimTranscript && (
          <div className="flex gap-3 justify-end animate-in fade-in duration-150">
            <div className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-cyan-950/60 border border-cyan-500/50 text-cyan-100 rounded-br-xs shadow-xl glow-cyan backdrop-blur-md">
              <div className="text-[10px] font-mono text-cyan-400 mb-0.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                Live AssemblyAI Streaming STT...
              </div>
              <p className="italic text-xs text-cyan-200">{interimTranscript} ...</p>
            </div>
            <div className="w-8 h-8 rounded-xl bg-cyan-900/60 border border-cyan-500 flex items-center justify-center flex-shrink-0 text-cyan-300">
              <User className="w-4 h-4" />
            </div>
          </div>
        )}
      </div>

      {/* Suggested Voice Prompts */}
      <div className="px-3 py-2 border-t border-white/[0.06] bg-slate-950/50 backdrop-blur-md flex items-center gap-2 overflow-x-auto text-[11px] whitespace-nowrap">
        <span className="text-slate-400 font-mono text-[10px] flex-shrink-0 uppercase tracking-wider pl-1 font-bold">
          Quick Prompts:
        </span>
        {samplePrompts.map((p, idx) => (
          <button
            key={idx}
            onClick={() => onSendText(p)}
            className="px-3 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-white/[0.06] hover:border-cyan-500/40 transition text-[11px] font-mono shadow-sm hover:scale-[1.02] active:scale-95"
          >
            "{p}"
          </button>
        ))}
      </div>

      {/* Voice / Mic Controls Bar */}
      <div className="p-3 border-t border-white/[0.08] bg-[#090e18] flex items-center gap-3">
        <button
          onClick={onToggleRecording}
          className={`relative flex items-center justify-center w-12 h-12 rounded-2xl transition-all shadow-xl flex-shrink-0 cursor-pointer ${
            isRecording
              ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-red-500/50 glow-red animate-pulse'
              : 'bg-gradient-to-br from-cyan-400 via-cyan-500 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-bold shadow-cyan-500/40 glow-cyan hover:scale-105 active:scale-95'
          }`}
          title={isRecording ? "Mute Microphone (Click to stop)" : "Activate Live Voice Streaming"}
        >
          {isRecording && <span className="absolute inset-0 rounded-2xl border-2 border-red-400 pulse-ring pointer-events-none" />}
          {isRecording ? <MicOff className="w-5 h-5 animate-pulse" /> : <Mic className="w-5 h-5" />}
        </button>

        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={isRecording ? "Listening to your voice in real-time..." : "Click mic to speak, or type SRE command..."}
            className="flex-1 bg-slate-900/80 border border-white/[0.08] rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/50 font-sans transition shadow-inner"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white disabled:opacity-30 transition shadow-md flex-shrink-0 cursor-pointer disabled:cursor-not-allowed hover:scale-105 active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

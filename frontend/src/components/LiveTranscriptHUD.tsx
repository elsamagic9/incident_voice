import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Send, User, Bot, Sparkles, VolumeX } from 'lucide-react';
import { Turn, AgentStatus } from '../types';

interface Props {
  turns: Turn[];
  interimTranscript: string;
  isRecording: boolean;
  agentStatus: AgentStatus;
  onToggleRecording: () => void;
  onSendText: (text: string) => void;
  onBargeIn: () => void;
}

export const LiveTranscriptHUD: React.FC<Props> = ({
  turns,
  interimTranscript,
  isRecording,
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

  return (
    <div className="flex flex-col h-full bg-[#101522] rounded-xl border border-slate-800 overflow-hidden shadow-xl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Voice Commander Stream</span>
        </div>
        {agentStatus === 'speaking' && (
          <button
            onClick={onBargeIn}
            className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition"
          >
            <VolumeX className="w-3 h-3" /> Interrupt Agent
          </button>
        )}
      </div>

      {/* Message List */}
      <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 font-sans text-sm">
        {turns.length === 0 && !interimTranscript && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <Mic className="w-8 h-8 text-cyan-500/40 mb-2 animate-bounce" />
            <p className="font-medium text-slate-300">Click the microphone to start voice triage</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              Powered by AssemblyAI Streaming v3. Speak naturally or click any prompt below.
            </p>
          </div>
        )}

        {turns.map((turn) => (
          <div
            key={turn.id}
            className={`flex gap-2.5 ${turn.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {turn.speaker !== 'user' && (
              <div className="w-7 h-7 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center flex-shrink-0 text-cyan-400">
                <Bot className="w-4 h-4" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 leading-relaxed text-sm ${
                turn.speaker === 'user'
                  ? 'bg-cyan-600 text-white rounded-br-none shadow-md'
                  : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-none'
              }`}
            >
              <div className="text-[10px] font-mono opacity-60 mb-0.5 flex justify-between gap-4">
                <span>{turn.speaker === 'user' ? 'YOU (SRE Lead)' : 'INCIDENTVOICE AI'}</span>
                {turn.confidence && <span>{(turn.confidence * 100).toFixed(0)}% conf</span>}
              </div>
              <p>{turn.transcript}</p>
            </div>
            {turn.speaker === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 text-slate-300">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {/* Interim Streaming Speech HUD */}
        {interimTranscript && (
          <div className="flex gap-2.5 justify-end">
            <div className="max-w-[85%] rounded-xl px-3.5 py-2.5 bg-cyan-900/40 border border-cyan-500/40 text-cyan-100 rounded-br-none animate-pulse">
              <div className="text-[10px] font-mono text-cyan-400 mb-0.5">Streaming STT (AssemblyAI)...</div>
              <p className="italic">{interimTranscript} ...</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-cyan-800/40 border border-cyan-600 flex items-center justify-center flex-shrink-0 text-cyan-300">
              <User className="w-4 h-4" />
            </div>
          </div>
        )}
      </div>

      {/* Suggested Voice Prompts */}
      <div className="px-3 py-2 border-t border-slate-800/70 bg-slate-900/30 flex items-center gap-1.5 overflow-x-auto text-[11px] whitespace-nowrap">
        <span className="text-slate-500 font-mono flex-shrink-0">Try saying:</span>
        {samplePrompts.map((p, idx) => (
          <button
            key={idx}
            onClick={() => onSendText(p)}
            className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            "{p}"
          </button>
        ))}
      </div>

      {/* Input / Mic Controls */}
      <div className="p-3 border-t border-slate-800 bg-[#0f172a] flex items-center gap-2">
        <button
          onClick={onToggleRecording}
          className={`flex items-center justify-center w-11 h-11 rounded-xl transition-all shadow-lg flex-shrink-0 ${
            isRecording
              ? 'bg-red-600 text-white animate-pulse shadow-red-500/30 glow-red'
              : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-cyan-500/20 glow-cyan'
          }`}
          title={isRecording ? "Mute Microphone" : "Activate Live Voice Streaming"}
        >
          {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={isRecording ? "Listening to your voice..." : "Speak via mic or type a command..."}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 font-sans"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, AudioLines, Bot, CornerDownLeft, Mic, MicOff, Send,
  Square, User, Terminal, ShieldAlert, Globe
} from 'lucide-react';
import type { AgentStatus, Turn } from '../types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  turns: Turn[];
  interimTranscript: string;
  agentTranscript?: string;
  isRecording: boolean;
  audioLevel?: number;
  agentStatus: AgentStatus;
  onToggleRecording: () => void;
  onSendText: (text: string) => void;
  onBargeIn: () => void;
  disabled?: boolean;
  voiceAvailable?: boolean;
  isConnected?: boolean;
  providerState?: string;
  providerMessage?: string;
}

const welcomePrompts = [
  { title: 'Jarvis, Run Diagnostics', text: 'Jarvis, run full diagnostics', icon: '01' },
  { title: 'Check Backend Host Vitals', text: 'Jarvis, check host vitals', icon: '02' },
  { title: 'Build Incident Brief', text: 'Investigate the incident', icon: '03' },
  { title: 'Search Web & SRE Docs', text: 'Search web for PostgreSQL connection pool exhaustion', icon: '04' },
];

const quickChips = [
  'Run autonomously',
  'List documents',
  'Search web: Postgres pool exhaustion',
  'Search web: Redis memory spike',
  'Jarvis, check host vitals',
  'Investigate the incident',
  'What is causing the outage?',
  'Restart payment-service',
  'Show dependency topology',
  'Generate postmortem',
];

export const LiveTranscriptHUD: React.FC<Props> = ({
  turns,
  interimTranscript,
  agentTranscript = '',
  isRecording,
  audioLevel = 0,
  agentStatus,
  onToggleRecording,
  onSendText,
  onBargeIn,
  disabled = false,
  voiceAvailable = false,
  isConnected = false,
  providerState,
  providerMessage,
}) => {
  const [input, setInput] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  const connecting = providerState === 'connecting';
  const speaking = agentStatus === 'speaking';
  const thinking = agentStatus === 'thinking';
  const awaiting = agentStatus === 'awaiting_confirmation';

  const label = speaking
    ? 'Speaking response...'
    : awaiting
    ? 'Awaiting approval'
    : thinking
    ? 'Reasoning over telemetry...'
    : connecting
    ? 'Connecting to AssemblyAI...'
    : isRecording
    ? 'Listening (Speak now)'
    : 'Copilot Standby';

  useEffect(() => {
    if (followLatest.current) {
      scroll.current?.scrollTo({
        top: scroll.current.scrollHeight,
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    }
  }, [turns, interimTranscript, agentTranscript, thinking, awaiting]);

  const send = (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || !input.trim()) return;
    followLatest.current = true;
    onSendText(input.trim());
    setInput('');
  };

  return (
    <section
      className="panel conversation-panel"
      aria-labelledby="conversation-heading"
    >
      {/* Header */}
      <div className="panel-heading p-4 border-b border-zinc-800/80 flex items-center justify-between gap-3">
        <div className="flex gap-3 items-center min-w-0">
          <div className="assistant-symbol w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <AudioLines size={20} className={speaking || isRecording ? 'animate-pulse text-cyan-400' : ''} />
          </div>
          <div className="min-w-0">
            <h2 id="conversation-heading" className="truncate text-sm font-semibold text-slate-100">J.A.R.V.I.S. Voice Commander</h2>
            <p className="muted truncate text-xs text-zinc-400">Autonomous AI Assistant & Incident Copilot</p>
          </div>
        </div>

        <Badge
          variant={isRecording ? "success" : speaking ? "cyan" : thinking || awaiting ? "warning" : "secondary"}
          className="gap-1.5 py-1 px-2.5 font-mono text-[11px]"
        >
          <span
            className={`status-dot w-1.5 h-1.5 rounded-full ${
              isRecording
                ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                : speaking
                ? 'bg-cyan-400 shadow-[0_0_8px_#38bdf8] animate-ping'
                : thinking || awaiting
                ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24] animate-pulse'
                : 'bg-zinc-400'
            }`}
          />
          <span>{label}</span>
        </Badge>
      </div>

      {/* Messages Scroll Area */}
      <div
        className="conversation-scroll flex-1 p-4 overflow-y-auto"
        ref={scroll}
        onScroll={() => {
          const element = scroll.current;
          if (element) {
            followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90;
          }
        }}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {!turns.length && !interimTranscript && !agentTranscript ? (
          <div className="conversation-welcome flex flex-col items-center text-center py-8 px-4">
            <div className="welcome-symbol w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-cyan-400 mb-3 shadow-inner">
              <AudioLines size={32} strokeWidth={1.75} />
            </div>
            <p className="eyebrow text-cyan-400 text-xs tracking-widest font-mono mb-1">READY FOR TRIAGE</p>
            <h3 className="text-base font-semibold text-slate-100 mb-1">Where should we investigate?</h3>
            <p className="muted text-xs text-zinc-400 max-w-sm mb-6">
              Ask about alerts, inspect a service, or start a runbook.
              Review the evidence before approving a change.
            </p>

            <div className="starter-prompts grid gap-2.5 w-full max-w-md text-left">
              {welcomePrompts.map(prompt => (
                <button
                  key={prompt.icon}
                  disabled={disabled}
                  onClick={() => onSendText(prompt.text)}
                  className="group flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-850 hover:border-cyan-500/40 transition-all text-xs text-slate-200"
                >
                  <span className="prompt-number font-mono text-zinc-500 group-hover:text-cyan-400 font-bold">{prompt.icon}</span>
                  <span className="flex-1 min-w-0">
                    <strong className="block text-slate-100 font-medium group-hover:text-cyan-300 transition-colors">{prompt.title}</strong>
                    <small className="text-zinc-400 font-mono text-[11px]">“{prompt.text}”</small>
                  </span>
                  <ArrowRight size={14} className="text-zinc-600 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="conversation-messages space-y-3">
            {turns.map(turn => (
              <article
                className={`chat-message flex gap-3 p-3.5 rounded-xl text-xs ${
                  turn.speaker === 'user'
                    ? 'chat-user bg-zinc-900/90 border border-zinc-800/90 text-slate-200'
                    : 'chat-agent bg-cyan-950/20 border border-cyan-500/25 text-slate-100'
                }`}
                key={turn.id}
              >
                <span className={`chat-avatar w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  turn.speaker === 'user' ? 'bg-zinc-800 text-zinc-300' : 'bg-cyan-500/20 text-cyan-400'
                }`}>
                  {turn.speaker === 'user' ? <User size={14} /> : <Bot size={14} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="chat-meta flex items-center justify-between text-[11px] mb-1 font-mono">
                    <strong className={turn.speaker === 'user' ? 'text-zinc-400' : 'text-cyan-400 font-semibold'}>
                      {turn.speaker === 'user'
                        ? 'Operator'
                        : turn.speaker === 'system'
                        ? 'System Monitor'
                        : 'IncidentVoice SRE'}
                    </strong>
                    <time className="text-zinc-500">
                      {new Date(turn.timestamp * 1000).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </time>
                  </div>
                  <p className="leading-relaxed whitespace-pre-wrap">{turn.transcript}</p>
                </div>
              </article>
            ))}

            {interimTranscript && (
              <div className="interim-message flex items-center gap-2.5 p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/40 text-xs">
                <Mic size={14} className="animate-pulse text-cyan-400 shrink-0" />
                <p className="font-mono text-cyan-200 flex-1">{interimTranscript}</p>
                <Badge variant="cyan" className="text-[9px] uppercase tracking-widest font-semibold">
                  Transcribing...
                </Badge>
              </div>
            )}

            {agentTranscript && (
              <article className="chat-message chat-agent flex gap-3 p-3.5 rounded-xl bg-cyan-950/25 border border-cyan-500/30 text-xs text-slate-100" aria-label="Live agent caption" aria-live="off">
                <span className="chat-avatar w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                  <Bot size={15} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="chat-meta flex items-center justify-between text-[11px] mb-1 font-mono">
                    <strong className="text-cyan-400 font-semibold">J.A.R.V.I.S.</strong>
                    <small className="text-cyan-500">Speaking · live caption</small>
                  </div>
                  <p className="leading-relaxed">{agentTranscript}</p>
                </div>
              </article>
            )}

            {thinking && !agentTranscript && (
              <div className="thinking-message flex items-center gap-2 p-3 text-xs text-amber-300 font-mono">
                <span className="thinking-dots flex gap-1">
                  <i className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" />
                  <i className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <i className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                </span>
                <span>Evaluating telemetry & reasoning over SRE tools...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Action Chips */}
      <div className="px-4 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-t border-zinc-800 bg-zinc-950/60">
        <span className="text-[10px] font-mono uppercase text-zinc-500 font-semibold mr-1 flex items-center gap-1 shrink-0">
          <Terminal size={11} /> Quick
        </span>
        {quickChips.map(chip => (
          <Button
            key={chip}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onSendText(chip)}
            className="shrink-0 h-6 px-2 text-[11px] font-medium border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:text-cyan-300 hover:border-zinc-700"
          >
            {chip.startsWith('Search') && <Globe size={11} className="text-cyan-400 mr-1" />}
            <span>{chip}</span>
          </Button>
        ))}
      </div>

      {/* Conversation Controls */}
      <div className="conversation-controls">
        <div className="voice-control-row flex items-center justify-between gap-3">
          <Button
            variant={isRecording ? "destructive" : "cyan"}
            size="sm"
            className={`button voice-button gap-2 font-semibold ${isRecording ? 'voice-active' : ''}`}
            onClick={onToggleRecording}
            disabled={!isRecording && (disabled || !voiceAvailable || connecting)}
          >
            {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
            <span>{isRecording ? 'Stop microphone' : connecting ? 'Connecting…' : 'Start voice'}</span>
          </Button>

          {/* Equalizer Visualizer */}
          <div className="voice-level flex items-center gap-0.5 h-6 px-2" aria-hidden="true">
            {Array.from({ length: 18 }, (_, i) => {
              const height = isRecording
                ? 4 + Math.max(0, Math.min(1, audioLevel)) * (14 + 16 * Math.sin((i + 1) * 1.6) ** 2)
                : 4;
              return (
                <span
                  key={i}
                  className="w-1 bg-cyan-500 rounded-full transition-all"
                  style={{ height: `${height}px` }}
                />
              );
            })}
          </div>

          {/* Barge-in Button */}
          {speaking && (
            <Button
              variant="outline"
              size="sm"
              className="button button-secondary interrupt-button gap-1.5 text-rose-300 hover:text-rose-200 border-rose-500/40 hover:border-rose-500/80 bg-rose-950/30"
              onClick={onBargeIn}
            >
              <Square size={13} className="fill-current" />
              <span>Stop reply</span>
            </Button>
          )}

          <Badge variant={isRecording ? "success" : "secondary"} className="text-[10px] font-mono tracking-wider">
            {isRecording ? '● MIC ACTIVE' : '○ MIC STANDBY'}
          </Badge>
        </div>

        {providerMessage && (
          <p role="status" className={`voice-provider-note text-xs ${providerState === 'error' ? 'text-amber-300' : 'text-zinc-400'}`}>
            {providerMessage}
          </p>
        )}

        {!voiceAvailable && !providerMessage && (
          <p className="voice-provider-note text-xs text-zinc-400">
            Voice requires an AssemblyAI server key. Text input remains active below.
          </p>
        )}

        {/* Text Composer */}
        <form className="command-composer flex items-center gap-2" onSubmit={send}>
          <label className="sr-only" htmlFor="sre-command">SRE command</label>
          <input
            id="sre-command"
            value={input}
            maxLength={4000}
            onChange={event => setInput(event.target.value)}
            placeholder={
              !isConnected
                ? 'Connect to start investigating…'
                : disabled
                ? 'Working on your request…'
                : 'Type SRE command or speak into mic…'
            }
            disabled={disabled}
            autoComplete="off"
            className="flex-1 h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-slate-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-400"
          />
          <Button
            type="submit"
            variant="cyan"
            size="icon"
            className="send-button h-9 w-9 shrink-0"
            aria-label="Send command"
            disabled={disabled || !input.trim()}
          >
            <Send size={15} />
          </Button>
        </form>

        <div className="composer-caption flex items-center justify-between text-[11px] text-zinc-500">
          <span className="flex items-center gap-1"><CornerDownLeft size={11} />Enter to send</span>
          <span className="text-amber-400/90 font-medium flex items-center gap-1">
            <ShieldAlert size={11} />
            Changes require your approval
          </span>
        </div>
      </div>
    </section>
  );
};

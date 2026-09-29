import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Bot, Mic, MicOff, Send,
  Square, User, Terminal, ShieldAlert,
  Volume2
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
  // Diagnostic panels rendered as cards at the end of the conversation, so the
  // evidence and approval surface lives inside the chat instead of beside it.
  inlineCards?: React.ReactNode;
}

// Titles match the command they send, so the accessible name and the quick chip
// below agree. A title/command split made the same control unaddressable by name.
const welcomePrompts = [
  { title: 'Inspect payment-service logs', text: 'Inspect payment-service logs' },
  { title: 'Run Full Diagnostics', text: 'Jarvis, run full diagnostics' },
  { title: 'Check Backend Host Vitals', text: 'Jarvis, check host vitals' },
  { title: 'Search Web & SRE Docs', text: 'Search web for PostgreSQL connection pool exhaustion' },
];

const quickChips = [
  'Inspect payment-service logs',
  'Jarvis, run full diagnostics',
  'Investigate the incident',
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
  inlineCards,
}) => {
  const [input, setInput] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  const connecting = providerState === 'connecting';
  const speaking = agentStatus === 'speaking';
  const thinking = agentStatus === 'thinking';
  const awaiting = agentStatus === 'awaiting_confirmation';

  const label = speaking
    ? 'Speaking'
    : awaiting
    ? 'Awaiting approval'
    : thinking
    ? 'Reasoning'
    : connecting
    ? 'Connecting'
    : isRecording
    ? 'Listening'
    : isConnected
    ? 'Voice Standby'
    : 'Offline';

  useEffect(() => {
    if (followLatest.current && scroll.current) {
      scroll.current.scrollTo({
        top: scroll.current.scrollHeight,
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    }
  }, [turns, interimTranscript, agentTranscript, thinking, awaiting, inlineCards]);

  const send = (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || !input.trim()) return;
    followLatest.current = true;
    onSendText(input.trim());
    setInput('');
  };

  const hasMessages = turns.length > 0 || !!interimTranscript || !!agentTranscript || thinking;

  // Normalized audio scale for animated orb ripple
  const pulseScale = isRecording ? 1 + Math.min(0.4, audioLevel * 1.5) : speaking ? 1.08 : 1;

  return (
    <div className="flex-1 flex flex-col h-full w-full max-w-3xl mx-auto px-2 sm:px-4" aria-labelledby="conversation-heading">
      {/* Messages / Hero Scroll Area */}
      <div
        className="flex-1 overflow-y-auto px-1 py-4 space-y-4 no-scrollbar"
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
        {!hasMessages ? (
          /* ChatGPT Voice Hero: Center Orb + Heading + Prompt Grid.
             Fixed height rather than min-h, so the diagnostics card appended
             below it cannot push the welcome prompts out of the viewport. */
          <div className="flex flex-col items-center justify-center h-[60vh] min-h-[380px] text-center px-4 py-4">
            
            {/* Interactive Voice Orb */}
            <div className="relative mb-6 flex items-center justify-center group cursor-pointer" onClick={onToggleRecording}>
              {/* Outer pulsing glow */}
              <div
                className={`absolute w-32 h-32 rounded-full transition-all duration-300 ${
                  isRecording
                    ? 'bg-rose-500/20 animate-ping'
                    : speaking
                    ? 'bg-emerald-500/25 animate-pulse'
                    : thinking
                    ? 'bg-amber-500/20 animate-spin'
                    : 'bg-emerald-500/10 group-hover:bg-emerald-500/20 group-hover:scale-110'
                }`}
                style={{ transform: `scale(${pulseScale})` }}
              />

              {/* Secondary ripple ring */}
              <div
                className={`absolute w-24 h-24 rounded-full border border-emerald-500/30 transition-all duration-500 ${
                  isRecording ? 'border-rose-400/50 scale-125' : speaking ? 'border-emerald-400 scale-110' : 'group-hover:scale-105'
                }`}
              />

              {/* Core Orb */}
              <button
                type="button"
                aria-label="Interactive Voice Orb"
                disabled={!isRecording && (disabled || !voiceAvailable || connecting)}
                className={`relative z-10 w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-xl ${
                  isRecording
                    ? 'bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-rose-500/30 ring-4 ring-rose-400/30'
                    : speaking
                    ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-emerald-500/30 ring-4 ring-emerald-400/30'
                    : thinking
                    ? 'bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-amber-500/30'
                    : 'bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700/80 text-foreground hover:border-emerald-500/60 hover:shadow-emerald-500/20'
                }`}
              >
                {isRecording ? (
                  <MicOff size={28} className="animate-pulse" />
                ) : speaking ? (
                  <Volume2 size={28} className="animate-bounce" />
                ) : (
                  <Mic size={28} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                )}
              </button>
            </div>

            {/* Voice Status Pill */}
            <Badge
              variant={isRecording ? "destructive" : speaking ? "default" : "secondary"}
              className="mb-4 gap-1.5 py-1 px-3 font-mono text-xs shadow-sm rounded-full"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isRecording
                    ? 'bg-rose-400 animate-ping'
                    : speaking
                    ? 'bg-emerald-400 animate-pulse'
                    : thinking
                    ? 'bg-amber-400 animate-pulse'
                    : isConnected
                    ? 'bg-emerald-500'
                    : 'bg-zinc-600'
                }`}
              />
              <span>{label}</span>
            </Badge>

            {/* Hero Title */}
            <h2 id="conversation-heading" className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mb-1">
              What shall we triage today?
            </h2>
            
            {/* Subtitle */}
            <p className="text-xs text-muted-foreground max-w-sm mb-6">
              Ask about active alerts, inspect telemetry, or speak a command.
            </p>

            {/* 2x2 Welcome Prompt Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
              {welcomePrompts.map(prompt => (
                <Button
                  key={prompt.text}
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onSendText(prompt.text)}
                  className="w-full justify-between text-left h-auto py-3 px-3.5 text-xs font-normal rounded-xl border-border/80 bg-card/70 hover:border-emerald-500/50 hover:bg-secondary/60 transition-all shadow-sm group"
                >
                  <span className="truncate text-foreground/90 group-hover:text-foreground font-medium">{prompt.title}</span>
                  <ArrowRight size={13} className="text-muted-foreground shrink-0 ml-2 group-hover:text-emerald-400 transition-colors" />
                </Button>
              ))}
            </div>

            {/* Diagnostics are reachable before the first message too */}
            {inlineCards}
          </div>
        ) : (
          /* Active Conversational Feed */
          <div className="space-y-4 max-w-2xl mx-auto w-full pt-2">
            {turns.map(turn => (
              <div
                key={turn.id}
                className={`flex gap-3 text-xs sm:text-sm ${turn.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {turn.speaker !== 'user' && (
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Bot size={15} />
                  </div>
                )}
                <div
                  className={`p-4 max-w-[85%] ${
                    turn.speaker === 'user'
                      ? 'bg-secondary text-foreground rounded-2xl rounded-br-sm shadow-sm'
                      : 'border border-border/80 bg-card text-foreground rounded-2xl rounded-bl-sm shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground mb-1.5 font-mono">
                    <span className="font-semibold text-foreground/80">{turn.speaker === 'user' ? 'You' : 'IncidentVoice'}</span>
                    <span>
                      {new Date(turn.timestamp * 1000).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="leading-relaxed whitespace-pre-wrap">{turn.transcript}</p>
                </div>
                {turn.speaker === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-secondary text-foreground flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold border border-border/60">
                    <User size={15} />
                  </div>
                )}
              </div>
            ))}

            {/* Transcribing live preview */}
            {interimTranscript && (
              <div className="flex items-center gap-2.5 p-3 rounded-2xl border border-border/80 bg-muted/50 text-xs text-foreground max-w-2xl mx-auto">
                <Mic size={15} className="animate-pulse text-emerald-400 shrink-0" />
                <p className="font-mono flex-1 text-xs">{interimTranscript}</p>
                <Badge variant="outline" className="text-[9px] uppercase font-mono">
                  Transcribing
                </Badge>
              </div>
            )}

            {/* Agent Speaking caption */}
            {agentTranscript && (
              <div className="flex gap-3 text-xs sm:text-sm justify-start max-w-2xl mx-auto" aria-label="Live agent caption" aria-live="off">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={15} />
                </div>
                <div className="rounded-2xl rounded-bl-sm p-4 max-w-[85%] border border-border/80 bg-card text-foreground shadow-sm">
                  <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground mb-1.5 font-mono">
                    <span className="font-semibold">IncidentVoice</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Speaking
                    </span>
                  </div>
                  <p className="leading-relaxed">{agentTranscript}</p>
                </div>
              </div>
            )}

            {/* Reasoning / Thinking indicator */}
            {thinking && !agentTranscript && (
              <div className="flex items-center gap-2.5 p-3 text-xs text-muted-foreground font-mono max-w-2xl mx-auto">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
                <span>Evaluating telemetry & reasoning over SRE tools…</span>
              </div>
            )}

            {/* Evidence, approval and receipts as cards inside the conversation */}
            {inlineCards}
          </div>
        )}
      </div>

      {/* Floating Bottom Composer Section */}
      <div className="pt-2 pb-3 w-full max-w-2xl mx-auto space-y-2">
        {/* Quick Action Chips (Only when in active conversation) */}
        {hasMessages && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-1">
            <span className="text-[10px] font-mono uppercase text-muted-foreground font-semibold mr-1 flex items-center gap-1 shrink-0">
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
                className="shrink-0 h-6 px-2.5 rounded-full text-[11px] font-normal border-border/60 bg-card/60 hover:bg-secondary/60 transition-all"
              >
                <span>{chip}</span>
              </Button>
            ))}
          </div>
        )}

        {/* Floating Pill Composer */}
        <div className="relative rounded-2xl border border-border/80 bg-secondary/80 backdrop-blur-md p-2 shadow-lg focus-within:border-emerald-500/80 focus-within:ring-1 focus-within:ring-emerald-500/50 transition-all">
          <form className="flex items-center gap-2" onSubmit={send}>
            {/* Mic Toggle Button with label for accessibility and tests */}
            <Button
              type="button"
              variant={isRecording ? "destructive" : "outline"}
              size="sm"
              className="h-8 px-2.5 rounded-full text-xs font-medium gap-1.5 shrink-0"
              onClick={onToggleRecording}
              disabled={!isRecording && (disabled || !voiceAvailable || connecting)}
            >
              {isRecording ? <MicOff size={14} /> : <Mic size={14} className="text-emerald-400" />}
              <span>{isRecording ? 'Stop microphone' : connecting ? 'Connecting…' : 'Start voice'}</span>
            </Button>

            {/* SRE command input */}
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
                  : 'Message Voice SRE Copilot or speak…'
              }
              disabled={disabled}
              autoComplete="off"
              className="flex-1 bg-transparent border-0 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
            />

            {/* Barge-in Stop Button if speaking */}
            {speaking && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 rounded-full text-[11px] text-destructive hover:bg-destructive/10 gap-1"
                onClick={onBargeIn}
              >
                <Square size={10} className="fill-current" />
                <span>Stop reply</span>
              </Button>
            )}

            {/* Send Button */}
            <Button
              type="submit"
              size="icon"
              className="h-8 w-8 rounded-full shrink-0 bg-foreground text-background hover:bg-foreground/90 shadow-sm"
              aria-label="Send command"
              disabled={disabled || !input.trim()}
            >
              <Send size={13} />
            </Button>
          </form>

          {/* Equalizer bar when recording */}
          {isRecording && (
            <div className="flex items-center justify-center gap-1 pt-1.5 pb-0.5">
              {Array.from({ length: 16 }, (_, i) => {
                const height = 4 + Math.max(0, Math.min(1, audioLevel)) * (12 + 10 * Math.sin((i + 1) * 1.2) ** 2);
                return (
                  <span
                    key={i}
                    className="w-1 rounded-full bg-emerald-400 transition-all duration-75"
                    style={{ height: `${height}px` }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Status / Disclaimer */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground px-2">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>AssemblyAI Universal-3 Pro</span>
          </span>
          <span className="text-amber-400/90 font-medium flex items-center gap-1">
            <ShieldAlert size={10} />
            Remediations require approval
          </span>
        </div>

        {providerMessage && (
          <p role="status" className="text-xs text-amber-400 text-center">
            {providerMessage}
          </p>
        )}
      </div>
    </div>
  );
};

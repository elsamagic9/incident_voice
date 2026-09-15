import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Bot, CornerDownLeft, Mic, MicOff, Send,
  Square, User, Terminal, ShieldAlert, Globe, Sparkles
} from 'lucide-react';
import type { AgentStatus, Turn } from '../types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardFooter, CardHeader } from '@/components/ui/card';

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
  { title: 'Inspect Payment Logs', text: 'Inspect payment-service logs' },
  { title: 'Run Full Diagnostics', text: 'Jarvis, run full diagnostics' },
  { title: 'Check Backend Host Vitals', text: 'Jarvis, check host vitals' },
  { title: 'Search Web & SRE Docs', text: 'Search web for PostgreSQL connection pool exhaustion' },
];

const quickChips = [
  'Run autonomously',
  'Inspect payment-service logs',
  'List documents',
  'Search web: Postgres pool exhaustion',
  'Search web: Redis memory spike',
  'Jarvis, check host vitals',
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
}) => {
  const [input, setInput] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  const connecting = providerState === 'connecting';
  const speaking = agentStatus === 'speaking';
  const thinking = agentStatus === 'thinking';
  const awaiting = agentStatus === 'awaiting_confirmation';

  const label = speaking
    ? 'Speaking...'
    : awaiting
    ? 'Awaiting approval'
    : thinking
    ? 'Reasoning...'
    : connecting
    ? 'Connecting...'
    : isRecording
    ? 'Listening'
    : 'Copilot Standby';

  useEffect(() => {
    if (followLatest.current && scroll.current) {
      scroll.current.scrollTo({
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
    <Card className="flex flex-col h-[clamp(380px,calc(100vh-350px),640px)] shadow-lg border-border/80 bg-card/60 backdrop-blur-md overflow-hidden rounded-2xl" aria-labelledby="conversation-heading">
      {/* ChatGPT-style Header with Model indicator & Ambient Glow */}
      <div className="relative overflow-hidden border-b border-border/60 bg-card/80">
        <div className={`ambient-glow ${(speaking || thinking || awaiting || isRecording) ? 'ambient-glow-active' : ''}`} />
        <CardHeader className="relative z-10 p-3.5 py-2.5 flex flex-row items-center justify-between space-y-0 border-b-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Sparkles size={14} />
            </div>
            <div className="min-w-0 flex items-center gap-2">
              <h2 id="conversation-heading" className="text-xs sm:text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                IncidentVoice <span className="text-[10px] font-mono font-normal text-muted-foreground px-1.5 py-0.5 rounded bg-muted/60">Universal-3 Pro</span>
              </h2>
            </div>
          </div>

          <Badge
            variant={isRecording ? "destructive" : speaking ? "default" : thinking || awaiting ? "warning" : "secondary"}
            className="gap-1.5 py-0.5 px-2 font-mono text-[10px] shadow-sm rounded-full backdrop-blur-md"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isRecording
                  ? 'bg-rose-400 animate-ping'
                  : speaking
                  ? 'bg-primary-foreground animate-pulse'
                  : thinking || awaiting
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-emerald-500'
              }`}
            />
            <span>{label}</span>
          </Badge>
        </CardHeader>
      </div>

      {/* Messages Scroll Area - ChatGPT Stream */}
      <div
        className="flex-1 p-4 overflow-y-auto space-y-4"
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
          <div className="flex flex-col items-center justify-center text-center h-full py-4 px-2">
            <div className="w-11 h-11 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2.5 shadow-sm">
              <Bot size={20} />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-0.5">What shall we triage today?</h3>
            <p className="text-xs text-muted-foreground max-w-xs mb-5">
              Ask about active alerts, inspect telemetry, or run automated runbooks.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
              {welcomePrompts.map(prompt => (
                <Button
                  key={prompt.text}
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onSendText(prompt.text)}
                  className="w-full justify-between text-left h-auto py-2 px-3 text-xs font-normal rounded-xl border-border/70 hover:border-accent hover:bg-secondary/40 transition-all"
                >
                  <span className="truncate">{prompt.title}</span>
                  <ArrowRight size={12} className="text-muted-foreground shrink-0 ml-1.5 opacity-60" />
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3.5 max-w-2xl mx-auto w-full">
            {turns.map(turn => (
              <div
                key={turn.id}
                className={`flex gap-3 text-xs ${turn.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {turn.speaker !== 'user' && (
                  <div className="w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={13} />
                  </div>
                )}
                <div
                  className={`p-3.5 max-w-[85%] ${
                    turn.speaker === 'user'
                      ? 'bg-secondary text-foreground rounded-2xl rounded-br-sm shadow-sm'
                      : 'border border-border/70 bg-card text-foreground rounded-2xl rounded-bl-sm shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground mb-1 font-mono">
                    <span className="font-semibold">{turn.speaker === 'user' ? 'You' : 'IncidentVoice'}</span>
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
                  <div className="w-7 h-7 rounded-full bg-secondary text-foreground flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold">
                    <User size={13} />
                  </div>
                )}
              </div>
            ))}

            {interimTranscript && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl border border-border/80 bg-muted/60 text-xs text-foreground">
                <Mic size={14} className="animate-pulse text-emerald-400 shrink-0" />
                <p className="font-mono flex-1 text-xs">{interimTranscript}</p>
                <Badge variant="outline" className="text-[9px] uppercase font-mono">
                  Transcribing
                </Badge>
              </div>
            )}

            {agentTranscript && (
              <div className="flex gap-3 text-xs justify-start" aria-label="Live agent caption" aria-live="off">
                <div className="w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={13} />
                </div>
                <div className="rounded-2xl rounded-bl-sm p-3.5 max-w-[85%] border border-border/70 bg-card text-foreground shadow-sm">
                  <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground mb-1 font-mono">
                    <span>IncidentVoice</span>
                    <span className="text-emerald-400 font-medium">Speaking</span>
                  </div>
                  <p className="leading-relaxed">{agentTranscript}</p>
                </div>
              </div>
            )}

            {thinking && !agentTranscript && (
              <div className="flex items-center gap-2 p-2.5 text-xs text-muted-foreground font-mono">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
                <span>Evaluating telemetry & reasoning over SRE tools...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Action Chips */}
      <div className="px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-t border-border/40 bg-card/30">
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
            className="shrink-0 h-6 px-2.5 rounded-full text-[11px] font-normal border-border/60 hover:bg-secondary/60 transition-all"
          >
            {chip.startsWith('Search') && <Globe size={10} className="mr-1 text-emerald-400" />}
            <span>{chip}</span>
          </Button>
        ))}
      </div>

      {/* ChatGPT Floating Pill Composer */}
      <CardFooter className="p-3 pt-2 border-t border-border/60 flex flex-col gap-1.5 bg-card/90">
        <div className="w-full flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="sm"
              className="h-7 px-2.5 rounded-full text-[11px] font-medium gap-1.5"
              onClick={onToggleRecording}
              disabled={!isRecording && (disabled || !voiceAvailable || connecting)}
            >
              {isRecording ? <MicOff size={13} /> : <Mic size={13} />}
              <span>{isRecording ? 'Stop microphone' : connecting ? 'Connecting…' : 'Start voice'}</span>
            </Button>

            {speaking && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 rounded-full text-[11px] text-destructive hover:bg-destructive/10 gap-1.5"
                onClick={onBargeIn}
              >
                <Square size={11} className="fill-current" />
                <span>Stop reply</span>
              </Button>
            )}
          </div>

          {/* Equalizer Waveform */}
          <div className="flex items-center gap-0.5 h-4 px-2" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => {
              const height = isRecording
                ? 3 + Math.max(0, Math.min(1, audioLevel)) * (8 + 8 * Math.sin((i + 1) * 1.5) ** 2)
                : 2.5;
              return (
                <span
                  key={i}
                  className={`w-0.5 rounded-full transition-all ${isRecording ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`}
                  style={{ height: `${height}px` }}
                />
              );
            })}
          </div>

          <Badge variant={isRecording ? "destructive" : "outline"} className="text-[9px] font-mono rounded-full px-2 py-0">
            {isRecording ? 'MIC LIVE' : 'STANDBY'}
          </Badge>
        </div>

        {providerMessage && (
          <p role="status" className="text-xs text-amber-400">
            {providerMessage}
          </p>
        )}

        {!voiceAvailable && !providerMessage && (
          <p className="text-[11px] text-muted-foreground">
            Voice requires an AssemblyAI server key. Text input remains active below.
          </p>
        )}

        {/* The Pill Form Bar */}
        <form className="w-full flex items-center gap-2 bg-secondary/70 border border-border/80 rounded-2xl px-2.5 py-1.5 shadow-sm focus-within:border-accent/80 focus-within:ring-1 focus-within:ring-accent transition-all" onSubmit={send}>
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
          <Button
            type="submit"
            size="icon"
            className="h-7 w-7 rounded-full shrink-0 bg-foreground text-background hover:bg-foreground/90 shadow-sm"
            aria-label="Send command"
            disabled={disabled || !input.trim()}
          >
            <Send size={12} />
          </Button>
        </form>

        {/* ChatGPT Footer Disclaimer */}
        <div className="w-full flex items-center justify-between text-[10px] text-muted-foreground px-1">
          <span className="flex items-center gap-1">
            <CornerDownLeft size={9} /> Enter to send
          </span>
          <span className="text-amber-400/90 font-medium flex items-center gap-1">
            <ShieldAlert size={10} />
            Remediations require approval
          </span>
        </div>
      </CardFooter>
    </Card>
  );
};

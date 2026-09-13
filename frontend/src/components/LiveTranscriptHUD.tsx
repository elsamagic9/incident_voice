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
    <Card className="flex flex-col h-[clamp(380px,calc(100vh-350px),640px)] shadow-sm border-border overflow-hidden" aria-labelledby="conversation-heading">
      {/* Header */}
      <CardHeader className="border-b border-border/80 p-4 py-3 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
            <Bot size={16} />
          </div>
          <div className="min-w-0">
            <h2 id="conversation-heading" className="text-sm font-semibold text-foreground truncate">
              Voice SRE Copilot
            </h2>
            <p className="text-xs text-muted-foreground truncate">
              Autonomous incident investigation
            </p>
          </div>
        </div>

        <Badge
          variant={isRecording ? "destructive" : speaking ? "default" : thinking || awaiting ? "warning" : "secondary"}
          className="gap-1.5 py-0.5 px-2 font-mono text-[11px]"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isRecording
                ? 'bg-rose-400 animate-ping'
                : speaking
                ? 'bg-primary-foreground animate-pulse'
                : thinking || awaiting
                ? 'bg-amber-400 animate-pulse'
                : 'bg-muted-foreground'
            }`}
          />
          <span>{label}</span>
        </Badge>
      </CardHeader>

      {/* Messages Scroll Area */}
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
          <div className="flex flex-col items-center justify-center text-center h-full py-6 px-2">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
              <Sparkles size={18} />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">How can I help with this incident?</h3>
            <p className="text-xs text-muted-foreground max-w-xs mb-6">
              Ask about active alerts, inspect telemetry, or run automated runbooks.
            </p>

            <div className="grid gap-2 w-full max-w-sm">
              {welcomePrompts.map(prompt => (
                <Button
                  key={prompt.text}
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onSendText(prompt.text)}
                  className="w-full justify-between text-left h-auto py-2.5 px-3 text-xs font-normal"
                >
                  <span className="truncate">{prompt.title}</span>
                  <ArrowRight size={13} className="text-muted-foreground shrink-0 ml-2" />
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            {turns.map(turn => (
              <div
                key={turn.id}
                className={`flex gap-3 text-xs ${turn.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {turn.speaker !== 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-secondary text-secondary-foreground flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={14} />
                  </div>
                )}
                <div
                  className={`rounded-xl p-3.5 max-w-[85%] ${
                    turn.speaker === 'user'
                      ? 'bg-primary text-primary-foreground shadow-sm rounded-br-none'
                      : 'border border-border bg-card text-card-foreground shadow-sm rounded-bl-none'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-[10px] opacity-70 mb-1 font-mono">
                    <span>{turn.speaker === 'user' ? 'Operator' : 'IncidentVoice'}</span>
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
                  <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0 mt-0.5">
                    <User size={14} />
                  </div>
                )}
              </div>
            ))}

            {interimTranscript && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/60 text-xs text-foreground">
                <Mic size={14} className="animate-pulse text-primary shrink-0" />
                <p className="font-mono flex-1 text-xs">{interimTranscript}</p>
                <Badge variant="outline" className="text-[9px] uppercase font-mono">
                  Transcribing
                </Badge>
              </div>
            )}

            {agentTranscript && (
              <div className="flex gap-3 text-xs justify-start" aria-label="Live agent caption" aria-live="off">
                <div className="w-7 h-7 rounded-lg bg-secondary text-secondary-foreground flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={14} />
                </div>
                <div className="rounded-xl p-3.5 max-w-[85%] border border-border bg-card text-card-foreground shadow-sm rounded-bl-none">
                  <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground mb-1 font-mono">
                    <span>IncidentVoice</span>
                    <span className="text-primary font-medium">Speaking</span>
                  </div>
                  <p className="leading-relaxed">{agentTranscript}</p>
                </div>
              </div>
            )}

            {thinking && !agentTranscript && (
              <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground font-mono">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
                <span>Evaluating telemetry & reasoning over SRE tools...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Action Chips */}
      <div className="px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-t border-border bg-muted/30">
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
            className="shrink-0 h-6 px-2 text-[11px] font-normal"
          >
            {chip.startsWith('Search') && <Globe size={10} className="mr-1" />}
            <span>{chip}</span>
          </Button>
        ))}
      </div>

      {/* Card Footer Controls */}
      <CardFooter className="p-3 border-t border-border flex flex-col gap-2.5 bg-card">
        <div className="w-full flex items-center justify-between gap-2">
          <Button
            variant={isRecording ? "destructive" : "default"}
            size="sm"
            className="gap-2 font-medium"
            onClick={onToggleRecording}
            disabled={!isRecording && (disabled || !voiceAvailable || connecting)}
          >
            {isRecording ? <MicOff size={14} /> : <Mic size={14} />}
            <span>{isRecording ? 'Stop microphone' : connecting ? 'Connecting…' : 'Start voice'}</span>
          </Button>

          {/* Equalizer Waveform */}
          <div className="flex items-center gap-0.5 h-5 px-2" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => {
              const height = isRecording
                ? 4 + Math.max(0, Math.min(1, audioLevel)) * (10 + 10 * Math.sin((i + 1) * 1.5) ** 2)
                : 3;
              return (
                <span
                  key={i}
                  className={`w-0.5 rounded-full transition-all ${isRecording ? 'bg-primary' : 'bg-muted'}`}
                  style={{ height: `${height}px` }}
                />
              );
            })}
          </div>

          {speaking && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:bg-destructive/10"
              onClick={onBargeIn}
            >
              <Square size={12} className="fill-current" />
              <span>Stop reply</span>
            </Button>
          )}

          <Badge variant={isRecording ? "destructive" : "outline"} className="text-[10px] font-mono">
            {isRecording ? 'MIC LIVE' : 'STANDBY'}
          </Badge>
        </div>

        {providerMessage && (
          <p role="status" className="text-xs text-amber-400">
            {providerMessage}
          </p>
        )}

        {!voiceAvailable && !providerMessage && (
          <p className="text-xs text-muted-foreground">
            Voice requires an AssemblyAI server key. Text input remains active below.
          </p>
        )}

        {/* Text Input Composer */}
        <form className="w-full flex items-center gap-2" onSubmit={send}>
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
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button
            type="submit"
            size="icon"
            className="h-9 w-9 shrink-0 shadow-sm"
            aria-label="Send command"
            disabled={disabled || !input.trim()}
          >
            <Send size={14} />
          </Button>
        </form>

        <div className="w-full flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <CornerDownLeft size={10} /> Enter to send
          </span>
          <span className="text-amber-500 font-medium flex items-center gap-1">
            <ShieldAlert size={10} />
            Changes require your approval
          </span>
        </div>
      </CardFooter>
    </Card>
  );
};

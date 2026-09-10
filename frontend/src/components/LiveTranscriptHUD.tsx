import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, AudioLines, Bot, CornerDownLeft, Mic, MicOff, Send,
  Square, User, Terminal, ShieldAlert
} from 'lucide-react';
import type { AgentStatus, Turn } from '../types';

interface Props {
  turns: Turn[];
  interimTranscript: string;
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
  { title: 'Identify Active Outage', text: 'What alerts are firing right now?', icon: '01' },
  { title: 'Investigate Container Logs', text: 'Inspect logs for payment-service', icon: '02' },
  { title: 'Execute Runbook Workflow', text: 'Start runbook postgres connection pool', icon: '03' },
];

const quickChips = [
  'What alerts are firing?',
  'Inspect payment-service',
  'Show dependency topology',
  'Restart payment-service',
  'Generate postmortem',
];

export const LiveTranscriptHUD: React.FC<Props> = ({
  turns,
  interimTranscript,
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
    ? 'Awaiting Voice Authorization...'
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
  }, [turns, interimTranscript, thinking, awaiting]);

  const send = (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || !input.trim()) return;
    followLatest.current = true;
    onSendText(input.trim());
    setInput('');
  };

  return (
    <section className="panel conversation-panel" aria-labelledby="conversation-heading">
      {/* Header */}
      <div className="panel-heading">
        <div className="flex gap-3 items-center min-w-0">
          <span className="assistant-symbol">
            <AudioLines size={20} className={speaking || isRecording ? 'animate-pulse text-cyan-400' : ''} />
          </span>
          <div className="min-w-0">
            <h2 id="conversation-heading" className="truncate">Voice SRE Incident Copilot</h2>
            <p className="muted truncate">Speak naturally. Stay in control.</p>
          </div>
        </div>

        <span className="conversation-status">
          <span
            className={`status-dot ${
              isRecording
                ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                : speaking
                ? 'bg-cyan-400 shadow-[0_0_8px_#38bdf8] animate-ping'
                : thinking || awaiting
                ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24] animate-pulse'
                : 'bg-slate-500'
            }`}
          />
          <span className="font-mono text-[11px] text-slate-300 font-medium">{label}</span>
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div
        className="conversation-scroll"
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
        {!turns.length && !interimTranscript ? (
          <div className="conversation-welcome">
            <div className="welcome-symbol">
              <AudioLines size={34} strokeWidth={1.75} />
            </div>
            <p className="eyebrow">READY FOR TRIAGE</p>
            <h3>How can I assist your incident?</h3>
            <p className="muted">
              Speak naturally via microphone or pick an action below.
              The agent investigates live metrics and stages changes for your voice authorization.
            </p>

            <div className="starter-prompts">
              {welcomePrompts.map(prompt => (
                <button
                  key={prompt.icon}
                  disabled={disabled}
                  onClick={() => onSendText(prompt.text)}
                  className="group"
                >
                  <span className="prompt-number">{prompt.icon}</span>
                  <span>
                    <strong>{prompt.title}</strong>
                    <small>“{prompt.text}”</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="conversation-messages">
            {turns.map(turn => (
              <article
                className={`chat-message ${turn.speaker === 'user' ? 'chat-user' : 'chat-agent'}`}
                key={turn.id}
              >
                <span className="chat-avatar">
                  {turn.speaker === 'user' ? <User size={15} /> : <Bot size={15} />}
                </span>
                <div>
                  <div className="chat-meta">
                    <strong>
                      {turn.speaker === 'user'
                        ? 'Operator'
                        : turn.speaker === 'system'
                        ? 'System Monitor'
                        : 'IncidentVoice SRE'}
                    </strong>
                    <time>
                      {new Date(turn.timestamp * 1000).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </time>
                  </div>
                  <p>{turn.transcript}</p>
                </div>
              </article>
            ))}

            {interimTranscript && (
              <div className="interim-message">
                <Mic size={15} className="animate-pulse text-cyan-400" />
                <p className="font-mono text-cyan-200">{interimTranscript}</p>
                <span className="text-[10px] uppercase font-mono tracking-widest text-cyan-500 font-semibold">
                  Transcribing...
                </span>
              </div>
            )}

            {thinking && (
              <div className="thinking-message">
                <span className="thinking-dots">
                  <i /><i /><i />
                </span>
                <span>Evaluating telemetry & reasoning over SRE tools...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Action Chips */}
      <div className="px-5 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-t border-slate-800/60 bg-slate-950/40">
        <span className="text-[10px] font-mono uppercase text-slate-500 font-semibold mr-1 flex items-center gap-1 shrink-0">
          <Terminal size={11} /> Quick
        </span>
        {quickChips.map(chip => (
          <button
            key={chip}
            type="button"
            disabled={disabled}
            onClick={() => onSendText(chip)}
            className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-800/80 hover:bg-slate-700/90 text-slate-300 hover:text-cyan-300 border border-slate-700/60 transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Conversation Controls */}
      <div className="conversation-controls">
        <div className="voice-control-row">
          <button
            className={`button voice-button ${isRecording ? 'voice-active' : ''}`}
            onClick={onToggleRecording}
            disabled={!isRecording && (disabled || !voiceAvailable || connecting)}
          >
            {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
            <span>{isRecording ? 'Stop microphone' : connecting ? 'Connecting…' : 'Start voice'}</span>
          </button>

          {/* Equalizer Visualizer */}
          <div className="voice-level" aria-hidden="true">
            {Array.from({ length: 18 }, (_, i) => {
              const height = isRecording
                ? 4 + Math.max(0, Math.min(1, audioLevel)) * (14 + 16 * Math.sin((i + 1) * 1.6) ** 2)
                : 4;
              return (
                <span
                  key={i}
                  style={{ height: `${height}px` }}
                />
              );
            })}
          </div>

          {/* Barge-in Button */}
          {speaking && (
            <button
              className="button button-secondary interrupt-button flex items-center gap-1.5 text-rose-300 hover:text-rose-200 border-rose-500/40 hover:border-rose-500/80 bg-rose-950/30"
              onClick={onBargeIn}
            >
              <Square size={13} className="fill-current" />
              <span>Stop reply</span>
            </button>
          )}

          <span className="voice-hint">
            {isRecording ? '● MIC ACTIVE · 16KHZ PCM' : '○ MIC STANDBY'}
          </span>
        </div>

        {providerMessage && (
          <p role="status" className={`voice-provider-note ${providerState === 'error' ? 'text-amber-300' : ''}`}>
            {providerMessage}
          </p>
        )}

        {!voiceAvailable && !providerMessage && (
          <p className="voice-provider-note">
            Voice requires an AssemblyAI server key. Text input remains active below.
          </p>
        )}

        {/* Text Composer */}
        <form className="command-composer" onSubmit={send}>
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
          />
          <button
            type="submit"
            className="send-button"
            aria-label="Send command"
            disabled={disabled || !input.trim()}
          >
            <Send size={16} />
          </button>
        </form>

        <div className="composer-caption">
          <span><CornerDownLeft size={11} />Press Return to execute</span>
          <span className="text-amber-400/90 font-medium">
            <ShieldAlert size={11} className="inline mr-1" />
            Destructive actions require explicit voice confirmation
          </span>
        </div>
      </div>
    </section>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import {
  FileText, X, Copy, Download, Play, Pause, Sparkles,
  ShieldCheck, Tag, MessageSquare, Volume2, Hash
} from 'lucide-react';
import { PostMortemData, BlackBoxSession, AuditManifest } from '../types';

interface Props {
  data: PostMortemData | null;
  onClose: () => void;
}

type Tab = 'pir' | 'tickets' | 'slack' | 'blackbox' | 'audit';

const buttonClass = 'button button-secondary';

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export const PostMortemViewer: React.FC<Props> = ({ data, onClose }) => {
  const [tab, setTab] = useState<Tab>('pir');
  const [blackbox, setBlackbox] = useState<BlackBoxSession | null>(null);
  const [audit, setAudit] = useState<AuditManifest | null>(null);
  const [metadataError, setMetadataError] = useState('');
  const [audioError, setAudioError] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const visible = !!data;

  useEffect(() => {
    if (!visible) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLButtonElement>('[aria-label="Close incident review"]')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab') {
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [visible]);

  useEffect(() => {
    if (!data) return;
    const controller = new AbortController();
    setBlackbox(null);
    setAudit(null);
    setMetadataError('');
    setAudioError('');
    setCurrentTime(0);
    setIsPlaying(false);

    const load = async <T,>(url: string, apply: (value: T) => void) => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Metadata request failed (${response.status}). Reconnect if your session expired.`);
        const value = await response.json();
        if (!controller.signal.aborted) apply(value);
      } catch (error) {
        if (!controller.signal.aborted) setMetadataError(error instanceof Error ? error.message : 'Metadata unavailable.');
      }
    };

    void load<BlackBoxSession>('/api/incident/blackbox', setBlackbox);
    void load<AuditManifest>('/api/audit-ledger', setAudit);
    return () => controller.abort();
  }, [data]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, blackbox]);

  if (!data) return null;
  const tickets = data.action_items_tickets ?? [];
  const duration = blackbox?.total_duration_seconds ?? 0;
  const markers = blackbox?.markers ?? [];
  const activeMarker = [...markers].reverse().find(marker => marker.time_seconds <= currentTime);
  const audioAvailable = !!blackbox?.audio_url && duration > 0;
  const isGateway = data.source === 'assemblyai_llm_gateway';
  const source = isGateway ? 'AssemblyAI LLM Gateway' : 'Local event summary';

  const tabs: [Tab, string, React.ReactNode][] = [
    ['pir', 'Incident report', <FileText key="1" size={13} />],
    ['tickets', `Draft tickets (${tickets.length})`, <Tag key="2" size={13} />],
    ['slack', 'Briefing draft', <MessageSquare key="3" size={13} />],
    ['blackbox', 'Captured audio', <Volume2 key="4" size={13} />],
    ['audit', 'Audit chain', <Hash key="5" size={13} />],
  ];

  const failAudio = () => {
    setIsPlaying(false);
    setAudioError('Audio playback failed. The recording may be unavailable or browser playback may be blocked.');
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !audioAvailable) return;
    setAudioError('');
    if (isPlaying) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      failAudio();
    }
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !audioAvailable) return;
    const time = Math.max(0, Math.min(duration, value));
    try {
      audio.currentTime = time;
      setCurrentTime(time);
    } catch {
      failAudio();
    }
  };

  const exportContent = () => {
    if (tab === 'tickets') return JSON.stringify(tickets, null, 2);
    if (tab === 'slack') return data.slack_briefing ?? '';
    if (tab === 'audit') return JSON.stringify(audit, null, 2);
    if (tab === 'blackbox') return JSON.stringify(blackbox, null, 2);
    return data.markdown_report;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportContent());
      setExportMessage('Copied to clipboard.');
      setTimeout(() => setExportMessage(''), 2500);
    } catch {
      setExportMessage('Copy failed. Use Download instead.');
    }
  };

  const download = async () => {
    try {
      let blob: Blob;
      const extension =
        tab === 'blackbox'
          ? 'wav'
          : ['tickets', 'audit'].includes(tab)
          ? 'json'
          : tab === 'pir'
          ? 'md'
          : 'txt';
      if (tab === 'blackbox') {
        if (!audioAvailable) return;
        const response = await fetch(blackbox!.audio_url!);
        if (!response.ok) throw new Error('The audio recording could not be downloaded.');
        blob = await response.blob();
      } else {
        blob = new Blob([exportContent()], { type: extension === 'json' ? 'application/json' : 'text/plain' });
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${tab}-${data.incident_id}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Download failed.');
    }
  };

  return (
    <div
      className="report-overlay"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Incident review"
    >
      <div className="report-panel">
        {audioAvailable && (
          <audio
            ref={audioRef}
            src={blackbox!.audio_url!}
            preload="metadata"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onError={failAudio}
            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
          />
        )}

        {/* Modal Header */}
        <header className="report-heading">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="p-1 rounded bg-cyan-500/20 text-cyan-400">
                <FileText size={16} />
              </span>
              <h2>
                Incident review · {data.incident_id}
              </h2>
              {isGateway && (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-gradient-to-r from-purple-950/80 to-cyan-950/80 border border-purple-500/40 text-purple-300">
                  <Sparkles size={11} className="text-purple-400 animate-pulse" />
                  AssemblyAI LLM Gateway
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">{data.title}</p><p className="field-help">Source: {source} · {data.infrastructure_mode ?? 'Unknown infrastructure'} · {data.incident_status ?? 'Unknown status'}</p>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => void copy()} className={buttonClass}>
              <Copy className="w-3.5 h-3.5 inline mr-1 text-cyan-400" />
              <span>Copy</span>
            </button>
            <button
              onClick={() => void download()}
              disabled={(tab === 'blackbox' && !audioAvailable) || (tab === 'audit' && !audit)}
              className={buttonClass}
            >
              <Download className="w-3.5 h-3.5 inline mr-1 text-emerald-400" />
              <span>Download</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close incident review"
              className="icon-button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Modal Tabs Bar */}
        <nav className="report-tabs" aria-label="Report artifacts">
          {tabs.map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                setExportMessage('');
              }}
              aria-pressed={tab === key}
              className="button button-quiet"
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Modal Scroll Content */}
        <div className="report-content space-y-5">
          {data.generation_warning && (
            <p role="status" className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-300 text-xs font-mono">
              {data.generation_warning}
            </p>
          )}
          {metadataError && (
            <p role="alert" className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs font-mono">
              {metadataError}
            </p>
          )}
          {exportMessage && (
            <p role="status" className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
              {exportMessage}
            </p>
          )}

          {/* TAB 1: Markdown PIR */}
          {tab === 'pir' && (
            <div className="space-y-5">
              {/* Stat HUD Pills */}
              <div className="grid grid-cols-3 gap-3 font-mono">
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                  <span className="text-[10px] uppercase text-slate-500 block mb-1">Severity Rating</span>
                  <p className="text-base font-bold text-rose-400 m-0">{data.severity}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                  <span className="text-[10px] uppercase text-slate-500 block mb-1">Mean Time to Detect (MTTD)</span>
                  <p className="text-base font-bold text-cyan-300 m-0">
                    {data.mttd_minutes == null ? 'Unavailable' : `${data.mttd_minutes} min`}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                  <span className="text-[10px] uppercase text-slate-500 block mb-1">Mean Time to Recover (MTTR)</span>
                  <p className="text-base font-bold text-emerald-400 m-0">
                    {data.mttr_minutes == null ? 'Unavailable' : `${data.mttr_minutes} min`}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-cyan-300 text-xs uppercase tracking-wider mb-2">
                  Executive Summary
                </h3>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 leading-relaxed text-xs text-slate-200">
                  {data.executive_summary}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-amber-300 text-xs uppercase tracking-wider mb-2">
                  Root Cause Diagnostic
                </h3>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 leading-relaxed text-xs text-slate-200">
                  {data.root_cause}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-emerald-300 text-xs uppercase tracking-wider mb-2">
                  Full Markdown Post-Incident Review Document
                </h3>
                <pre className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 whitespace-pre-wrap text-xs text-slate-300 font-mono overflow-x-auto leading-relaxed max-h-96">
                  {data.markdown_report}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 2: Jira / Linear Action Items */}
          {tab === 'tickets' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                Proposed drafts only. No Jira or Linear tickets have been created externally.
              </p>
              {tickets.length ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  {tickets.map((ticket, index) => (
                    <article
                      key={index}
                      className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-xl p-4 space-y-2 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-cyan-400 text-xs font-semibold">{ticket.id}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                          ticket.priority === 'P0'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}>
                          {ticket.priority}
                        </span>
                      </div>
                      <h3 className="font-semibold text-white text-sm">{ticket.title}</h3>
                      <p className="text-xs text-slate-300 leading-relaxed">{ticket.description}</p>
                      <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                        <span>Owner: <strong className="text-slate-200">{ticket.owner_team}</strong></span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No ticket drafts were generated.</p>
              )}
            </div>
          )}

          {/* TAB 3: Slack Briefing */}
          {tab === 'slack' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Briefing draft. Review before publishing; no external message has been sent.
              </p>
              <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 whitespace-pre-wrap font-mono text-xs text-emerald-300 leading-relaxed max-h-96 overflow-y-auto">
                {data.slack_briefing || 'No briefing was generated.'}
              </pre>
            </div>
          )}

          {/* TAB 4: Black Box Audio Replay */}
          {tab === 'blackbox' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                Captured tracks: {blackbox?.recorded_tracks?.join(', ') || 'none'}. Managed-engine replies are recorded; custom-engine speech output is not captured.
              </p>
              {blackbox && !audioAvailable && <p>No audio was recorded in this session. Text-only commands do not create an audio recording.</p>}
              {blackbox?.recording_limited && <p className="text-amber-300">Recording reached its session limit; later audio is not included.</p>}

              {audioError && <p role="alert" className="text-rose-300 text-xs font-mono">{audioError}</p>}

              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => void togglePlay()}
                    disabled={!audioAvailable}
                    className="p-3 rounded-full bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)] disabled:opacity-40 transition-transform active:scale-95"
                    aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
                  >
                    {isPlaying ? <Pause size={18} /> : <Play size={18} className="translate-x-0.5" />}
                  </button>

                  <div className="font-mono text-xs text-slate-300" aria-label="Recording time">
                    <span className="text-cyan-300 font-bold">{formatTime(currentTime)}</span>
                    <span className="text-slate-500 mx-1">/</span>
                    <span>{formatTime(duration)}</span>
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-slate-400">Speed:</span>
                    <select
                      aria-label="Playback speed"
                      value={speed}
                      onChange={event => setSpeed(Number(event.target.value))}
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                    >
                      {[1, 1.25, 1.5, 2].map(value => (
                        <option key={value} value={value}>
                          {value}x
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Range Slider */}
                <input
                  aria-label="Recording position"
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={Math.min(currentTime, duration)}
                  disabled={!audioAvailable}
                  onChange={event => seek(Number(event.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />

                {/* Simulated Waveform Display */}
                <div className="flex h-12 gap-0.5 items-end bg-slate-950 p-2 rounded-lg border border-slate-800/80" aria-label="Captured waveform">
                  {(blackbox?.waveform_peaks ?? []).map((peak, index) => {
                    const isPassed = (index / (blackbox?.waveform_peaks?.length || 1)) * duration <= currentTime;
                    return (
                      <div
                        key={index}
                        className={`flex-1 rounded-sm transition-colors ${
                          isPassed ? 'bg-cyan-400 shadow-[0_0_4px_#38bdf8]' : 'bg-slate-700'
                        }`}
                        style={{ height: `${Math.max(4, peak * 100)}%` }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Synchronized Markers */}
              {markers.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                    Audio Event Timestamps
                  </h4>
                  {markers.map(marker => (
                    <button
                      key={marker.id}
                      onClick={() => seek(marker.time_seconds)}
                      disabled={!audioAvailable || marker.time_seconds > duration}
                      className={`block w-full text-left p-3 rounded-xl border transition-colors ${
                        activeMarker?.id === marker.id && isPlaying
                          ? 'border-cyan-500 bg-cyan-950/30'
                          : 'border-slate-800 bg-slate-900/60 hover:bg-slate-850'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-mono text-cyan-300 font-semibold">{marker.time_label}</span>
                        <span className="text-slate-400 uppercase text-[10px] font-mono">{marker.speaker}</span>
                      </div>
                      <p className="text-xs text-slate-200 m-0">{marker.transcript}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: Cryptographic Audit Hash Ledger */}
          {tab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-white text-sm">SHA-256 SRE Cryptographic Chain</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    In-memory tamper-evident records. This is not SOC-2 or ISO-27001 certification.
                  </p>
                </div>
                {audit && (
                  <span className={`status-tag ${audit.chain_status === 'TAMPER_EVIDENT_VALID' ? 'status-good' : 'status-danger'}`}>
                    <ShieldCheck size={14} />
                    Integrity: {audit.chain_status}
                  </span>
                )}
              </div>

              {audit?.failure_details && <p role="alert" className="text-rose-300">{audit.failure_details}</p>}
              {audit ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs text-slate-300">
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Blocks checked:</span>
                      <span className="text-cyan-400">{audit.total_cryptographic_blocks}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Latest block hash:</span>
                      <span className="text-slate-200 truncate ml-2">{audit.merkle_leaf_root_hash}</span>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {audit.blocks.slice().reverse().map(block => (
                      <article key={block.block_index} className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 text-xs space-y-1.5">
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className="text-cyan-400 font-bold">Block #{block.block_index}</span>
                          <span className="text-slate-400">{block.event_type}</span>
                          <span className="text-emerald-400">{block.actor}</span>
                        </div>
                        <pre className="text-[10px] font-mono bg-slate-950 p-2 rounded border border-slate-800/60 text-slate-300 overflow-x-auto m-0">
                          {JSON.stringify(block.details, null, 2)}
                        </pre>
                        <p className="text-[10px] font-mono text-slate-500 break-all m-0">
                          SHA-256: {block.block_hash}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Audit metadata loading or unavailable.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

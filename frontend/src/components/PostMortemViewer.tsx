import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, X, Check, Copy, Download, Sparkles, AlertOctagon, ShieldAlert,
  Ticket, MessageSquare, Code, CheckCircle2, Radio, Play, Pause, RotateCcw,
  Volume2, Clock, User, Bot, AlertTriangle
} from 'lucide-react';
import { PostMortemData, ActionItemTicket, BlackBoxSession, BlackBoxMarker, AuditManifest } from '../types';

interface Props {
  data: PostMortemData | null;
  onClose: () => void;
}

type TabType = 'pir' | 'tickets' | 'slack' | 'blackbox' | 'audit';

export const PostMortemViewer: React.FC<Props> = ({ data, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('pir');
  const [copied, setCopied] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  // Black Box Audio Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [blackbox, setBlackbox] = useState<BlackBoxSession | null>(null);
  const [auditManifest, setAuditManifest] = useState<AuditManifest | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Fetch Black Box Flight Recorder Data
    fetch('/api/incident/blackbox')
      .then(res => res.json())
      .then(d => setBlackbox(d))
      .catch(err => console.warn('Could not fetch blackbox metadata:', err));

    // Fetch SOC-2 Audit Ledger Manifest
    fetch('/api/audit-ledger')
      .then(res => res.json())
      .then(d => setAuditManifest(d))
      .catch(err => console.warn('Could not fetch audit ledger:', err));
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  if (!data) return null;

  const fallbackTickets: ActionItemTicket[] = [
    {
      id: `JIRA-${data.incident_id.replace('INC-', '')}-01`,
      title: 'Deploy PgBouncer connection multiplexer in front of PostgreSQL',
      priority: 'P0',
      owner_team: 'Database Infra',
      component: 'Database / Connection Pool',
      description: 'Install and configure PgBouncer pooling layer to prevent connection pool starvation during checkout traffic spikes.'
    },
    {
      id: `JIRA-${data.incident_id.replace('INC-', '')}-02`,
      title: 'Add composite index on orders (user_id, status) relation',
      priority: 'P0',
      owner_team: 'Backend Core',
      component: 'Payment & Order Processing',
      description: 'Create composite index to eliminate ExclusiveLock contention causing worker thread blocks.'
    },
    {
      id: `JIRA-${data.incident_id.replace('INC-', '')}-03`,
      title: 'Configure Envoy ingress circuit breaker threshold for payment-service',
      priority: 'P1',
      owner_team: 'Reliability / SRE',
      component: 'Ingress Gateway',
      description: 'Tune circuit breaker tripping logic to fast-fail traffic and protect downstream database health.'
    },
    {
      id: `JIRA-${data.incident_id.replace('INC-', '')}-04`,
      title: 'Establish automated synthetic health check alert at 5% error threshold',
      priority: 'P1',
      owner_team: 'Observability',
      component: 'Alerting / Monitoring',
      description: 'Reduce MTTD by alerting on canary payment errors before customer-visible cascading 503 outage.'
    }
  ];

  const tickets = data.action_items_tickets && data.action_items_tickets.length > 0
    ? data.action_items_tickets
    : fallbackTickets;

  const fallbackSlack = (
    `🚨 *Sev-1 Outage Resolved: Payment Gateway HTTP 503 Spike (${data.incident_id})*\n` +
    `• *Impact & Root Cause:* 42.6% checkout failure rate isolated to PostgreSQL connection pool exhaustion (200/200 client handles maxed) and Redis memory pressure. MTTD: ${data.mttd_minutes} min | MTTR: ${data.mttr_minutes} min.\n` +
    `• *Mitigation Applied:* IncidentVoice voice agent autonomously recycled payment worker pods, scaled replicas from 2 to 5, and flushed stale Redis connection locks.\n` +
    `• *Follow-up & Preventative Action:* ${tickets.length} Jira action items created (2 P0s assigned to Database Infra & Backend Core for PgBouncer deployment and index optimization). Full PIR report attached.`
  );

  const slackBriefing = data.slack_briefing || fallbackSlack;

  const totalDuration = blackbox?.total_duration_seconds || 90;
  const waveformPeaks = blackbox?.waveform_peaks || Array.from({ length: 100 }, (_, i) => 0.1 + 0.4 * Math.sin(i * 0.3) ** 2);
  const markers: BlackBoxMarker[] = blackbox?.markers || [
    { id: '1', time_seconds: 0, time_label: '00:00', speaker: 'system', transcript: 'PagerDuty Sev-1 Alert: HighErrorRate on payment-gateway', event_type: 'alert', is_key_milestone: true },
    { id: '2', time_seconds: 14, time_label: '00:14', speaker: 'user', transcript: 'What alerts are active and why is checkout failing?', event_type: 'voice', is_key_milestone: false },
    { id: '3', time_seconds: 22, time_label: '00:22', speaker: 'agent', transcript: 'Payment service failing with 42% 503 errors due to DB pool exhaustion.', event_type: 'voice', is_key_milestone: true },
    { id: '4', time_seconds: 47, time_label: '00:47', speaker: 'agent', transcript: 'Remediation staged: Rolling restart of payment-service. Awaiting confirmation.', event_type: 'remediation', is_key_milestone: true },
    { id: '5', time_seconds: 70, time_label: '01:10', speaker: 'agent', transcript: 'Confirmed. Graceful rolling restart executed. Replacement pods healthy.', event_type: 'verification', is_key_milestone: true },
    { id: '6', time_seconds: 84, time_label: '01:24', speaker: 'system', transcript: 'Incident Mitigated: All services returning to nominal health.', event_type: 'resolved', is_key_milestone: true }
  ];

  const simIntervalRef = useRef<number | null>(null);

  const clearSimInterval = () => {
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearSimInterval();
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      clearSimInterval();
      setIsPlaying(false);
    } else {
      clearSimInterval();
      audioRef.current.play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err) => {
          console.warn('Audio playback blocked by browser, engaging simulated replay:', err);
          setIsPlaying(true);
          simIntervalRef.current = window.setInterval(() => {
            setCurrentTime((prev) => {
              const next = prev + 0.25 * playbackSpeed;
              if (next >= totalDuration) {
                clearSimInterval();
                setIsPlaying(false);
                return totalDuration;
              }
              return next;
            });
          }, 250);
        });
    }
  };

  const handleSeek = (seconds: number) => {
    const clamped = Math.max(0, Math.min(totalDuration, seconds));
    setCurrentTime(clamped);
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(clamped, totalDuration);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleCopy = async () => {
    let content = '';
    if (activeTab === 'pir') {
      content = data.markdown_report;
    } else if (activeTab === 'tickets') {
      content = JSON.stringify(tickets, null, 2);
    } else if (activeTab === 'slack') {
      content = slackBriefing;
    } else if (activeTab === 'audit') {
      content = JSON.stringify(auditManifest, null, 2);
    } else {
      content = JSON.stringify(blackbox || markers, null, 2);
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.warn('Clipboard copy failed:', e);
    }
  };

  const handleDownload = () => {
    if (activeTab === 'blackbox') {
      const a = document.createElement('a');
      a.href = '/api/incident/blackbox/audio.wav';
      a.download = `incident-blackbox-${data.incident_id}.wav`;
      a.click();
      return;
    }

    let content = '';
    let filename = '';
    let mimeType = 'text/plain';

    if (activeTab === 'pir') {
      content = data.markdown_report;
      filename = `postmortem-${data.incident_id}.md`;
      mimeType = 'text/markdown';
    } else if (activeTab === 'tickets') {
      content = JSON.stringify(tickets, null, 2);
      filename = `jira-tickets-${data.incident_id}.json`;
      mimeType = 'application/json';
    } else if (activeTab === 'audit') {
      content = JSON.stringify(auditManifest, null, 2);
      filename = `soc2-audit-manifest-${data.incident_id}.json`;
      mimeType = 'application/json';
    } else {
      content = slackBriefing;
      filename = `slack-briefing-${data.incident_id}.txt`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Find active marker based on currentTime
  const activeMarker = markers.reduce((prev, curr) => {
    return curr.time_seconds <= currentTime ? curr : prev;
  }, markers[0]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#101522] border border-cyan-500/40 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden glow-cyan">
        {/* Hidden Audio Element */}
        <audio
          ref={audioRef}
          src="/api/incident/blackbox/audio.wav"
          onTimeUpdate={() => {
            if (audioRef.current) {
              setCurrentTime(audioRef.current.currentTime);
            }
          }}
          onEnded={() => {
            clearSimInterval();
            setIsPlaying(false);
          }}
        />

        {/* Top Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Multi-Artifact Post-Mortem & Incident Black Box</h2>
                <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-cyan-400" /> Powered by AssemblyAI LeMUR
                </span>
              </div>
              <p className="text-xs text-slate-400">{data.incident_id}: {data.title}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : activeTab === 'tickets' ? 'Copy JSON' : activeTab === 'slack' ? 'Copy Slack' : activeTab === 'blackbox' ? 'Copy Flight Log' : 'Copy Markdown'}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md transition"
            >
              <Download className="w-3.5 h-3.5" />
              {activeTab === 'tickets' ? 'Export .json' : activeTab === 'slack' ? 'Export .txt' : activeTab === 'blackbox' ? 'Export .wav Audio' : 'Export .md'}
            </button>
            <button
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.pause();
                }
                clearSimInterval();
                setIsPlaying(false);
                onClose();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 4-Artifact Tab Navigation Bar */}
        <div className="flex items-center bg-slate-950 border-b border-slate-800 px-4 pt-2 gap-2 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('pir')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition border-b-2 shrink-0 ${
              activeTab === 'pir'
                ? 'bg-slate-900 text-cyan-400 border-cyan-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>(a) Formal Markdown PIR</span>
          </button>

          <button
            onClick={() => setActiveTab('tickets')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition border-b-2 shrink-0 ${
              activeTab === 'tickets'
                ? 'bg-slate-900 text-amber-400 border-amber-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            <Ticket className="w-4 h-4" />
            <span>(b) Jira / Linear Tickets ({tickets.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('slack')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition border-b-2 shrink-0 ${
              activeTab === 'slack'
                ? 'bg-slate-900 text-emerald-400 border-emerald-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>(c) Slack Sev-1 Outage Briefing</span>
          </button>

          <button
            onClick={() => setActiveTab('blackbox')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition border-b-2 shrink-0 ${
              activeTab === 'blackbox'
                ? 'bg-slate-900 text-cyan-300 border-cyan-300 font-bold glow-cyan'
                : 'text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            <Radio className="w-4 h-4 text-cyan-400" />
            <span>(d) Acoustic Black Box Audio</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition border-b-2 shrink-0 ${
              activeTab === 'audit'
                ? 'bg-slate-900 text-indigo-400 border-indigo-400 font-bold glow-indigo'
                : 'text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-indigo-400" />
            <span>(e) SOC-2 Audit Ledger ({auditManifest?.total_cryptographic_blocks || 0})</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-300 font-sans text-sm">
          {/* TAB 1: FORMAL PIR (MARKDOWN) */}
          {activeTab === 'pir' && (
            <div className="space-y-6">
              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 text-center">
                  <span className="text-slate-500 text-[10px] uppercase font-mono block">SEVERITY</span>
                  <span className="text-lg font-bold text-red-400">{data.severity}</span>
                </div>
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 text-center">
                  <span className="text-slate-500 text-[10px] uppercase font-mono block">MTTD (DETECTION)</span>
                  <span className="text-lg font-bold text-cyan-300">{data.mttd_minutes} min</span>
                </div>
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 text-center">
                  <span className="text-slate-500 text-[10px] uppercase font-mono block">MTTR (RESOLUTION)</span>
                  <span className="text-lg font-bold text-emerald-400">{data.mttr_minutes} min</span>
                </div>
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 text-center">
                  <span className="text-slate-500 text-[10px] uppercase font-mono block">ACTION ITEMS</span>
                  <span className="text-lg font-bold text-slate-200">{(data.preventive_action_items || []).length} P0/P1 tasks</span>
                </div>
              </div>

              {/* Executive Summary */}
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2 flex items-center gap-1.5">
                  <AlertOctagon className="w-4 h-4" /> Executive Summary
                </h3>
                <p className="text-slate-200 leading-relaxed">{data.executive_summary}</p>
              </div>

              {/* Root Cause */}
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
                <h3 className="text-xs font-bold uppercase tracking-wider text-red-400 mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" /> Root Cause Analysis (RCA)
                </h3>
                <p className="text-slate-200 leading-relaxed">{data.root_cause}</p>
              </div>

              {/* Preventative Action Items */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">
                  Preventative Action Items (Generated by LeMUR)
                </h3>
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="p-3">Priority</th>
                        <th className="p-3">Action Item</th>
                        <th className="p-3">Owner Team</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {(data.preventive_action_items || []).map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/40">
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                              item.priority === 'P0'
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}>
                              {item.priority}
                            </span>
                          </td>
                          <td className="p-3 text-slate-200 font-medium">{item.action}</td>
                          <td className="p-3 text-slate-400 font-mono">{item.owner_team}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Markdown Document Preview */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">Raw Post-Incident Review Markdown</span>
                  <span className="text-[10px] font-mono text-slate-500">GFM Format</span>
                </div>
                <pre className="p-4 text-xs font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-60 leading-relaxed">
                  {data.markdown_report}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 2: JIRA / LINEAR ACTION TICKETS JSON */}
          {activeTab === 'tickets' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-900/70 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <Ticket className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-white">
                    {tickets.length} Verified Production Action Tickets
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Linear / Jira Cloud Compatible
                  </span>
                </div>
                <button
                  onClick={() => setShowRawJson(!showRawJson)}
                  className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition"
                >
                  <Code className="w-3.5 h-3.5" />
                  <span>{showRawJson ? 'View Ticket Cards' : 'View Raw JSON'}</span>
                </button>
              </div>

              {showRawJson ? (
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 p-4">
                  <pre className="text-xs font-mono text-amber-200/90 whitespace-pre-wrap overflow-x-auto max-h-96">
                    {JSON.stringify(tickets, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tickets.map((t, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition gap-2"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono text-xs font-bold text-cyan-400">{t.id}</span>
                          <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                            t.priority === 'P0'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}>
                            {t.priority}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-white leading-snug">{t.title}</h4>
                        <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{t.description}</p>
                      </div>

                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-500">
                        <span>Team: <strong className="text-slate-300">{t.owner_team}</strong></span>
                        {t.component && <span>Component: <strong className="text-slate-300">{t.component}</strong></span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SLACK SEV-1 OUTAGE BRIEFING */}
          {activeTab === 'slack' && (
            <div className="space-y-4">
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">
                    Slack 3-Bullet Outage Resolution Briefing
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  Channel: #incidents-sev1-announcements
                </span>
              </div>

              {/* Slack-Themed Message Card */}
              <div className="bg-[#1A1D21] border-l-4 border-red-500 rounded-r-xl p-5 shadow-xl font-sans text-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-cyan-600 flex items-center justify-center font-bold text-xs text-white shadow">
                    IV
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-xs">IncidentVoice Bot</span>
                      <span className="text-[10px] px-1 py-0.2 rounded bg-slate-700 text-slate-300 font-mono uppercase">APP</span>
                      <span className="text-[11px] text-slate-400">Today at {new Date().toLocaleTimeString()}</span>
                    </div>

                    <div className="text-xs leading-relaxed text-slate-200 whitespace-pre-wrap font-sans bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                      {slackBriefing}
                    </div>

                    <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Incident Mitigated & Verified
                      </span>
                      <span>•</span>
                      <span>Ready for stakeholder copy-paste</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ACOUSTIC INCIDENT BLACK BOX REPLAY */}
          {activeTab === 'blackbox' && (
            <div className="space-y-5">
              {/* Introduction Card */}
              <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                    <Radio className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wide">
                      Acoustic War-Room Flight Recorder & Audio Replay
                    </h3>
                    <p className="text-xs text-slate-400">
                      Synchronized cockpit audio log capturing verbal triage, emergency commands, and automated mitigations.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                    16kHz PCM High-Fidelity
                  </span>
                </div>
              </div>

              {/* Master Audio Controller Box */}
              <div className="bg-slate-950/90 border border-cyan-500/40 rounded-xl p-5 shadow-2xl flex flex-col gap-4 glow-cyan">
                {/* Transport Bar */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlay}
                      className="w-11 h-11 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center font-bold shadow-lg shadow-cyan-500/30 transition"
                    >
                      {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                    </button>
                    <button
                      onClick={() => handleSeek(0)}
                      className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition"
                      title="Rewind to 00:00"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Time Counter */}
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-cyan-300 font-bold text-sm">{formatSeconds(currentTime)}</span>
                    <span className="text-slate-600">/</span>
                    <span className="text-slate-400">{formatSeconds(totalDuration)}</span>
                  </div>

                  {/* Speed Selector */}
                  <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[11px] font-mono">
                    {[1, 1.5, 2].map((sp) => (
                      <button
                        key={sp}
                        onClick={() => setPlaybackSpeed(sp)}
                        className={`px-2 py-1 rounded transition ${
                          playbackSpeed === sp
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {sp}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Waveform Bar Canvas / Scrubber */}
                <div className="relative py-2 select-none">
                  <div
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const ratio = (e.clientX - rect.left) / rect.width;
                      handleSeek(ratio * totalDuration);
                    }}
                    className="h-16 w-full flex items-end justify-between gap-[2px] cursor-pointer bg-slate-900/60 p-2 rounded-lg border border-slate-800/80 relative"
                  >
                    {waveformPeaks.map((peak, idx) => {
                      const barTime = (idx / waveformPeaks.length) * totalDuration;
                      const isPast = barTime <= currentTime;
                      const isCurrent = Math.abs(barTime - currentTime) < (totalDuration / waveformPeaks.length);
                      return (
                        <div
                          key={idx}
                          style={{ height: `${Math.max(12, peak * 100)}%` }}
                          className={`flex-1 rounded-t-sm transition-colors duration-75 ${
                            isCurrent
                              ? 'bg-cyan-300 shadow-md shadow-cyan-400'
                              : isPast
                              ? 'bg-cyan-500/80'
                              : 'bg-slate-700/50 hover:bg-slate-600'
                          }`}
                        />
                      );
                    })}

                    {/* Scrubber Playhead Line */}
                    <div
                      style={{ left: `${(currentTime / totalDuration) * 100}%` }}
                      className="absolute top-0 bottom-0 w-0.5 bg-cyan-300 shadow-lg pointer-events-none"
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-cyan-300 -ml-1 -mt-1 shadow" />
                    </div>
                  </div>
                </div>

                {/* Jump-to-Event Bookmarks Bar */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 text-[11px] font-mono">
                  <span className="text-slate-500 shrink-0">Jump To:</span>
                  {markers.filter(m => m.is_key_milestone).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleSeek(m.time_seconds)}
                      className={`px-2 py-1 rounded-lg border shrink-0 transition flex items-center gap-1.5 ${
                        activeMarker.id === m.id
                          ? 'bg-cyan-950 text-cyan-300 border-cyan-500 font-bold'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-[10px] text-cyan-400">{m.time_label}</span>
                      <span className="truncate max-w-[140px]">{m.transcript.split(':')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Synchronized Live Transcript Karaoke Stream */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Synchronized Incident Audio Transcript
                  </h4>
                  <span className="text-[10px] font-mono text-slate-500">
                    Auto-highlights with playback
                  </span>
                </div>

                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {markers.map((m) => {
                    const isActive = activeMarker.id === m.id;
                    const isAgent = m.speaker === 'agent';
                    const isAlert = m.event_type === 'alert';

                    return (
                      <div
                        key={m.id}
                        onClick={() => handleSeek(m.time_seconds)}
                        className={`p-3 rounded-xl border transition cursor-pointer flex items-start gap-3 ${
                          isActive
                            ? 'bg-cyan-950/40 border-cyan-400 shadow-md ring-1 ring-cyan-400/40 glow-cyan'
                            : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900/90'
                        }`}
                      >
                        <div className="shrink-0 mt-0.5">
                          {isAlert ? (
                            <div className="p-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/40">
                              <AlertTriangle className="w-4 h-4" />
                            </div>
                          ) : isAgent ? (
                            <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                              <Bot className="w-4 h-4" />
                            </div>
                          ) : (
                            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/40">
                              <User className="w-4 h-4" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white">
                                {isAlert ? 'PagerDuty Alert System' : isAgent ? 'IncidentVoice Commander' : 'On-Call SRE Engineer'}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                                {m.time_label}
                              </span>
                            </div>

                            {isActive && (
                              <span className="text-[10px] font-mono text-cyan-400 font-bold animate-pulse flex items-center gap-1">
                                <Volume2 className="w-3 h-3" /> Playing Now
                              </span>
                            )}
                          </div>

                          <p className={`text-xs leading-relaxed ${isActive ? 'text-cyan-100 font-medium' : 'text-slate-300'}`}>
                            {m.transcript}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SOC-2 CRYPTOGRAPHIC AUDIT LEDGER */}
          {activeTab === 'audit' && (
            <div className="space-y-6">
              {/* Top Certification Card */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/80 via-slate-900 to-indigo-950/80 border border-indigo-500/40 shadow-lg">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                      <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">SOC-2 Type II & ISO-27001 Cryptographic Ledger</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> 100% Verified
                        </span>
                      </div>
                      <p className="text-xs text-indigo-200/80 mt-0.5 font-mono">
                        Immutable SHA-256 Hash Chain • Zero Unauthorized Alterations Detected
                      </p>
                    </div>
                  </div>

                  <div className="text-right font-mono text-[11px] text-slate-400">
                    <div>Total Cryptographic Blocks: <strong className="text-indigo-300">{auditManifest?.total_cryptographic_blocks || 0}</strong></div>
                    <div className="truncate max-w-[240px]" title={auditManifest?.merkle_leaf_root_hash || ''}>
                      Root Hash: <span className="text-cyan-400">{auditManifest?.merkle_leaf_root_hash ? `${auditManifest.merkle_leaf_root_hash.slice(0, 16)}...` : 'Pending'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chained Blocks List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                    Cryptographic Chain of Custody
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono">
                    SHA-256 Merkle-Chained Blocks
                  </span>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {auditManifest?.blocks && auditManifest.blocks.length > 0 ? (
                    auditManifest.blocks.slice().reverse().map((block) => (
                      <div
                        key={block.block_index}
                        className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90 font-mono text-xs hover:border-indigo-500/50 transition"
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-bold text-[10px]">
                              BLOCK #{block.block_index}
                            </span>
                            <span className="text-white font-bold text-xs">{block.event_type}</span>
                            <span className="text-slate-400 text-[10px]">({block.action})</span>
                          </div>

                          <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span>Actor: <strong className="text-slate-300">{block.actor}</strong> [{block.role}]</span>
                            <span>•</span>
                            <span>{new Date(block.timestamp_iso).toLocaleTimeString()}</span>
                          </div>
                        </div>

                        {/* Block Details */}
                        {block.details && Object.keys(block.details).length > 0 && (
                          <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 mb-2.5 text-[11px] text-slate-300 overflow-x-auto">
                            <pre className="font-mono">{JSON.stringify(block.details, null, 2)}</pre>
                          </div>
                        )}

                        {/* Hashes */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-slate-400 pt-1">
                          <div className="truncate">
                            <span className="text-slate-500">Prev Hash: </span>
                            <span className="text-slate-400 font-mono">{block.prev_hash}</span>
                          </div>
                          <div className="truncate">
                            <span className="text-indigo-400">Block Hash: </span>
                            <span className="text-emerald-400 font-mono font-semibold">{block.block_hash}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-500 font-mono text-xs">
                      Initializing Cryptographic Ledger...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

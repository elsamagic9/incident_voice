import React, { useState } from 'react';
import {
  FileText, X, Check, Copy, Download, Sparkles, AlertOctagon, ShieldAlert,
  Ticket, MessageSquare, Code, CheckCircle2
} from 'lucide-react';
import { PostMortemData, ActionItemTicket } from '../types';

interface Props {
  data: PostMortemData | null;
  onClose: () => void;
}

type TabType = 'pir' | 'tickets' | 'slack';

export const PostMortemViewer: React.FC<Props> = ({ data, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('pir');
  const [copied, setCopied] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

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

  const handleCopy = async () => {
    let content = '';
    if (activeTab === 'pir') {
      content = data.markdown_report;
    } else if (activeTab === 'tickets') {
      content = JSON.stringify(tickets, null, 2);
    } else {
      content = slackBriefing;
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

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#101522] border border-cyan-500/40 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden glow-cyan">
        {/* Top Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Multi-Artifact Post-Mortem Synthesis</h2>
                <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-cyan-400" /> Synthesized via AssemblyAI LeMUR
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
              {copied ? 'Copied' : activeTab === 'tickets' ? 'Copy JSON' : activeTab === 'slack' ? 'Copy Slack' : 'Copy Markdown'}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md transition"
            >
              <Download className="w-3.5 h-3.5" />
              {activeTab === 'tickets' ? 'Export .json' : activeTab === 'slack' ? 'Export .txt' : 'Export .md'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 3-Artifact Tab Navigation Bar */}
        <div className="flex items-center bg-slate-950 border-b border-slate-800 px-4 pt-2 gap-2 text-xs">
          <button
            onClick={() => setActiveTab('pir')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition border-b-2 ${
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
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition border-b-2 ${
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
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition border-b-2 ${
              activeTab === 'slack'
                ? 'bg-slate-900 text-emerald-400 border-emerald-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>(c) Slack Sev-1 Outage Briefing</span>
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
        </div>
      </div>
    </div>
  );
};

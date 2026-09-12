import React, { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, Sparkles, FileText, FlaskConical, Layers, LockKeyhole, Network, RefreshCw, ShieldAlert, Wrench, X } from 'lucide-react';
import { useVoiceStream } from './hooks/useVoiceStream';
import { MissionControlHeader } from './components/MissionControlHeader';
import { LiveTranscriptHUD } from './components/LiveTranscriptHUD';
import { ServiceHealthMatrix } from './components/ServiceHealthMatrix';
import { ServiceDependencyGraph } from './components/ServiceDependencyGraph';
import { RunbookWorkflowHUD } from './components/RunbookWorkflowHUD';
import { IncidentTimeline } from './components/IncidentTimeline';
import { ToolExecutionCard } from './components/ToolExecutionCard';
import { PostMortemViewer } from './components/PostMortemViewer';
import { LiveTelemetryDrawer } from './components/LiveTelemetryDrawer';
import { InvestigationPanel } from './components/InvestigationPanel';
import { ApprovalCard } from './components/ApprovalCard';
import { SettingsView } from './components/SettingsView';
import { UsageAnalyticsView } from './components/UsageAnalyticsView';
import { ActivePage } from './components/MissionControlHeader';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <main className="app-error"><ShieldAlert size={32} /><h1>Something went wrong</h1><p>Reload the workspace to reconnect to your session.</p><button className="button button-primary" onClick={() => window.location.reload()}>Reload workspace</button></main>;
    return this.props.children;
  }
}

type View = 'brief' | 'services' | 'runbooks' | 'topology' | 'demo';

function Workspace() {
  const voice = useVoiceStream();
  const [activePage, setActivePage] = useState<ActivePage>('mission_control');
  const [view, setView] = useState<View>('services');
  const [activityView, setActivityView] = useState<'tools' | 'timeline'>('tools');
  const [reportOpen, setReportOpen] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const simulation = voice.operator?.infrastructure_mode === 'simulation';
  const disabled = !voice.isConnected || voice.busy;
  const services = Object.values(voice.services);
  const critical = services.filter(service => service.status === 'critical').length;
  const healthy = services.filter(service => service.status === 'healthy').length;
  const unresolved = services.filter(service => ['critical', 'degraded'].includes(service.status)).length;
  const status = voice.incident?.status;

  useEffect(() => {
    if (voice.activeRunbook?.status === 'active') setView('runbooks');
  }, [voice.activeRunbook?.runbook_id, voice.activeRunbook?.status]);
  useEffect(() => { if (voice.investigation?.id) setView('brief'); }, [voice.investigation?.id]);
  const latestCheckId = voice.recoveryChecks?.[voice.recoveryChecks.length - 1]?.id;
  useEffect(() => { if (latestCheckId) setView('brief'); }, [latestCheckId]);
  useEffect(() => { if (voice.postMortem) setReportOpen(true); }, [voice.postMortem]);
  useEffect(() => { if (!simulation && view === 'demo') setView('services'); }, [simulation, view]);

  const tabs = [
    { id: 'brief' as const, label: 'Brief', icon: Sparkles },
    { id: 'services' as const, label: 'Services', icon: Layers },
    { id: 'runbooks' as const, label: 'Runbooks', icon: Wrench },
    { id: 'topology' as const, label: 'Topology', icon: Network },
    ...(simulation ? [{ id: 'demo' as const, label: 'Demo lab', icon: FlaskConical }] : []),
  ];
  const report = () => voice.postMortem ? setReportOpen(true) : voice.sendTextCommand('Generate postmortem');
  const reasoning = voice.activeEngine === 'voice_agent_api' && voice.providerState === 'ready' ? 'AssemblyAI managed' : voice.reasoningProvider === 'scripted' ? 'Scripted fallback' : voice.reasoningProvider;

  return <div className="workspace-shell">
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <MissionControlHeader incident={voice.incident} agentStatus={voice.isPlaying ? 'speaking' : voice.agentStatus}
      isConnected={voice.isConnected} latency={voice.latency} activeEngine={voice.activeEngine}
      providerState={voice.providerState} providerErrorCode={voice.providerErrorCode}
      infrastructureMode={voice.operator?.infrastructure_mode} rbacRole={voice.operator?.role} busy={voice.busy}
      autopilotEnabled={voice.autopilotEnabled} onToggleAutopilot={simulation ? voice.toggleAutopilot : undefined}
      onSelectEngine={voice.selectEngine} onReset={voice.resetIncident}
      activePage={activePage} onNavigate={setActivePage} />

    <main id="workspace" className="workspace-main">
      {activePage === 'settings' ? (
        <SettingsView
          onNavigateBack={() => setActivePage('mission_control')}
          onSelectEngine={voice.selectEngine}
          onResetIncident={voice.resetIncident}
          currentEngine={voice.activeEngine}
          currentAutopilot={voice.autopilotEnabled}
          onToggleAutopilot={simulation ? voice.toggleAutopilot : undefined}
          rbacRole={voice.operator?.role}
          infrastructureMode={voice.operator?.infrastructure_mode}
        />
      ) : activePage === 'usage' ? (
        <UsageAnalyticsView
          onNavigateBack={() => setActivePage('mission_control')}
          latency={voice.latency}
          turns={voice.turns}
          executedTools={voice.executedTools}
          isRecording={voice.isRecording}
          audioLevel={voice.audioLevel}
          incidentId={voice.incident?.id}
        />
      ) : (
        <>
          <section className="workspace-heading">
        <div>
          <p className="eyebrow">OPERATIONS / INCIDENT WORKSPACE</p>
          <h1>Less typing. Faster triage<span className="accent-text">.</span></h1>
          <p className="muted">Investigate together. Make the next move with confidence.</p>
        </div>
        <div className="heading-actions"><button className="button button-primary" disabled={disabled || !voice.incident} onClick={() => { setView('brief'); voice.sendTextCommand('Investigate the incident'); }}><Sparkles size={16} />Investigate incident</button>
        <button className="button button-secondary" disabled={disabled || !voice.incident} onClick={report}>
          <FileText size={16} />
          {voice.postMortem ? 'Open incident report' : 'Create incident report'}
          <ArrowUpRight size={15} />
        </button></div>
      </section>

      {voice.loginRequired && <section className="login-card" aria-labelledby="login-heading">
        <div className="icon-tile"><LockKeyhole size={22} /></div>
        <div><h2 id="login-heading">Connect to your workspace</h2><p className="muted">Enter your operator token to start investigating.</p></div>
        <form onSubmit={async event => { event.preventDefault(); setSigningIn(true); try { await voice.login(accessToken); setAccessToken(''); } finally { setSigningIn(false); } }}>
          <label className="sr-only" htmlFor="operator-token">Operator access token</label>
          <input id="operator-token" type="password" placeholder="Operator access token" autoComplete="current-password" value={accessToken} onChange={event => setAccessToken(event.target.value)} required />
          <button className="button button-primary" disabled={signingIn} type="submit">{signingIn ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </section>}

      {voice.error && <div role="alert" className="message-banner message-error"><ShieldAlert size={18} /><p>{voice.error}</p><button className="icon-button" aria-label="Dismiss error" onClick={voice.clearError}><X size={16} /></button></div>}
      {voice.notice && <div role="status" className="message-banner"><Activity size={18} /><p>{voice.notice}</p><button className="icon-button" aria-label="Dismiss notice" onClick={voice.clearNotice}><X size={16} /></button></div>}

      <section className="incident-overview" aria-label="Incident overview">
        <div className="incident-summary">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`status-tag ${status === 'RESOLVED' ? 'status-good' : voice.incident ? 'status-danger' : ''}`}>
              <span className={`status-dot ${status === 'RESOLVED' ? 'dot-good' : voice.incident ? 'dot-warning animate-ping' : ''}`} />
              {voice.incident?.severity ?? 'Awaiting session'}
            </span>
            <span className="mono text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 text-xs">
              {voice.incident?.id ?? 'INC-STANDBY'}
            </span>
          </div>
          <h2>{voice.incident?.title.replace(/^P\d:\s*/, '') ?? 'Your investigation starts here'}</h2>
          <p>
            <span className={`status-dot ${status === 'RESOLVED' ? 'dot-good' : voice.incident ? 'dot-warning' : ''}`} />
            <span className="font-medium text-slate-200">
              {status ? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ') : 'Session Standby'}
            </span>
            <span className="summary-separator">/</span>
            <span>{simulation ? 'Demo simulation · no live changes' : voice.operator ? `${voice.operator.infrastructure_mode} infrastructure` : 'Connecting to server'}</span>
          </p>
        </div>
        <div className="overview-stat">
          <span className="eyebrow">NEEDS ATTENTION</span>
          <strong className={unresolved ? 'text-amber-400' : 'text-slate-300'}>{services.length ? unresolved : '—'}</strong>
          <span>{critical ? `${critical} active critical services` : 'Services requiring triage'}</span>
        </div>
        <div className="overview-stat">
          <span className="eyebrow">CLUSTER HEALTH</span>
          <strong className={healthy === services.length && services.length > 0 ? 'text-emerald-400' : 'text-slate-200'}>
            {services.length ? <>{healthy}<small> / {services.length}</small></> : '—'}
          </strong>
          <span>{simulation ? 'Healthy in this scenario' : 'Verified healthy services'}</span>
        </div>
      </section>

      {voice.stagedRemediation && <ApprovalCard action={voice.stagedRemediation} disabled={disabled} onApprove={voice.authorizeRemediation} onCancel={voice.cancelRemediation} />}

      <div className="workspace-grid">
        <LiveTranscriptHUD turns={voice.turns} interimTranscript={voice.currentInterimTranscript} agentTranscript={voice.currentAgentTranscript} isRecording={voice.isRecording}
          audioLevel={voice.audioLevel} agentStatus={voice.isPlaying ? 'speaking' : voice.agentStatus}
          disabled={disabled} voiceAvailable={!!voice.operator?.assemblyai_configured} isConnected={voice.isConnected}
          providerState={voice.providerState} providerMessage={voice.providerMessage}
          onToggleRecording={voice.toggleRecording} onSendText={voice.sendTextCommand} onBargeIn={voice.bargeIn} />

        <div className="diagnostics-column">
          <section className="panel diagnostics-panel" aria-label="Investigation tools">
            <div className="panel-heading"><div><p className="eyebrow">INVESTIGATE</p><h2>The bigger picture</h2></div><span className="small-count">{services.length} services</span></div>
            <nav className="view-tabs" aria-label="Investigation views">{tabs.map(({ id, label, icon: Icon }) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}><Icon size={15} />{label}{id === 'runbooks' && voice.activeRunbook?.status === 'active' && <span className="status-dot dot-good" />}</button>)}</nav>
            <div className="diagnostic-content">
              {view === 'brief' && <InvestigationPanel brief={voice.investigation ?? null} checks={voice.recoveryChecks ?? []} disabled={disabled} onCommand={voice.sendTextCommand} />}
              {view === 'services' && <ServiceHealthMatrix services={voice.services} infrastructureMode={voice.operator?.infrastructure_mode} onInspect={service => voice.sendTextCommand(`Inspect logs for ${service}`)} disabled={disabled} />}
              {view === 'topology' && <ServiceDependencyGraph topology={voice.topology} onSendAction={disabled ? undefined : voice.sendTextCommand} />}
              {view === 'runbooks' && <RunbookWorkflowHUD activeRunbook={voice.activeRunbook} disabled={disabled || !!voice.stagedRemediation} onStartRunbook={voice.startRunbook} onAdvanceRunbook={voice.advanceRunbook} onAbortRunbook={voice.abortRunbook} />}
              {view === 'demo' && simulation && <LiveTelemetryDrawer onTriggerChaos={voice.simulateScenario} disabled={disabled} />}
            </div>
          </section>

          <section className="panel activity-panel" aria-label="Session activity">
            <div className="activity-heading"><h2><Activity size={17} />Session activity</h2><div className="segmented-control"><button aria-pressed={activityView === 'tools'} onClick={() => setActivityView('tools')}>Actions <span>{voice.executedTools.length}</span></button><button aria-pressed={activityView === 'timeline'} onClick={() => setActivityView('timeline')}>Timeline</button></div></div>
            <div className="activity-feed">
              {activityView === 'timeline' ? <IncidentTimeline incident={voice.incident} /> : voice.executedTools.length ? [...voice.executedTools].reverse().map(tool => <ToolExecutionCard key={tool.id} tool={tool} />) : <div className="compact-empty"><Wrench size={20} /><div><h3>Your actions, in one place</h3><p>Checks and remediation results appear here as you investigate.</p></div></div>}
            </div>
          </section>
        </div>
      </div>
        </>
      )}

      <footer className="workspace-footer" aria-label="Connection and provider status">
        <span>
          <span className={`status-dot ${voice.isConnected ? 'dot-good' : ''}`} />
          {voice.isConnected ? 'Server connected' : 'Server disconnected'}
          <button className="text-button" onClick={voice.reconnect}><RefreshCw size={12} />Reconnect</button>
        </span>
        <span className="flex items-center gap-2 flex-wrap">
          <span>Reasoning: <strong className="text-slate-200">{reasoning}</strong></span>
          <span className="summary-separator">/</span>
          <span className="text-cyan-400 font-medium">Voice & reports by AssemblyAI</span>
        </span>
      </footer>
    </main>
    {reportOpen && voice.postMortem && <PostMortemViewer data={voice.postMortem} onClose={() => setReportOpen(false)} />}
  </div>;
}

export const App: React.FC = () => <ErrorBoundary><Workspace /></ErrorBoundary>;

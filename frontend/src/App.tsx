import React, { useEffect, useState } from 'react';
import {
  Activity, ArrowUpRight, Sparkles, FileText, FlaskConical,
  Layers, LockKeyhole, Network, RefreshCw, ShieldAlert, Wrench, X,
  AlertTriangle, CheckCircle2
} from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-background text-foreground">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-4">
            <ShieldAlert size={28} />
          </div>
          <h1 className="text-xl font-bold tracking-tight mb-2">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">Reload the workspace to reconnect to your session.</p>
          <Button onClick={() => window.location.reload()}>Reload workspace</Button>
        </main>
      );
    }
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
  const reasoning = voice.activeEngine === 'voice_agent_api' && voice.providerState === 'ready'
    ? 'AssemblyAI managed'
    : voice.reasoningProvider === 'scripted'
    ? 'Scripted fallback'
    : voice.reasoningProvider;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-muted selection:text-foreground">
      <a className="skip-link" href="#workspace">Skip to workspace</a>
      <MissionControlHeader
        incident={voice.incident}
        agentStatus={voice.isPlaying ? 'speaking' : voice.agentStatus}
        isConnected={voice.isConnected}
        latency={voice.latency}
        activeEngine={voice.activeEngine}
        providerState={voice.providerState}
        providerErrorCode={voice.providerErrorCode}
        busy={voice.busy}
        autopilotEnabled={voice.autopilotEnabled}
        onToggleAutopilot={simulation ? voice.toggleAutopilot : undefined}
        onSelectEngine={voice.selectEngine}
        activePage={activePage}
        onNavigate={setActivePage}
      />

      <main id="workspace" className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4">
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
            {/* Top Section / Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/80">
              <div>
                <p className="eyebrow text-muted-foreground">OPERATIONS / INCIDENT WORKSPACE</p>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-0.5">
                  Less typing. Faster triage.
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Investigate together. Make the next move with confidence.
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <Button
                  size="sm"
                  disabled={disabled || !voice.incident}
                  onClick={() => { setView('brief'); voice.sendTextCommand('Investigate the incident'); }}
                  className="gap-1.5 shadow-sm"
                >
                  <Sparkles size={14} />
                  <span>Investigate incident</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled || !voice.incident}
                  onClick={report}
                  className="gap-1.5 shadow-sm"
                >
                  <FileText size={14} />
                  <span>{voice.postMortem ? 'Open incident report' : 'Create incident report'}</span>
                  <ArrowUpRight size={13} className="text-muted-foreground" />
                </Button>
              </div>
            </div>

            {/* Operator Login Modal Card */}
            {voice.loginRequired && (
              <Card className="max-w-md mx-auto border-border bg-card shadow-lg p-6 my-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <LockKeyhole size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Connect to your workspace</h2>
                    <p className="text-xs text-muted-foreground">Enter your operator token to start investigating.</p>
                  </div>
                </div>
                <form onSubmit={async event => {
                  event.preventDefault();
                  setSigningIn(true);
                  try {
                    await voice.login(accessToken);
                    setAccessToken('');
                  } finally {
                    setSigningIn(false);
                  }
                }} className="space-y-4">
                  <div>
                    <label className="sr-only" htmlFor="operator-token">Operator access token</label>
                    <input
                      id="operator-token"
                      type="password"
                      placeholder="Operator access token"
                      autoComplete="current-password"
                      value={accessToken}
                      onChange={event => setAccessToken(event.target.value)}
                      required
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                  <Button size="sm" className="w-full" disabled={signingIn} type="submit">
                    {signingIn ? 'Signing in…' : 'Sign in'}
                  </Button>
                </form>
              </Card>
            )}

            {/* Error / Notice Banners */}
            {voice.error && (
              <div role="alert" className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm">
                <div className="flex items-center gap-2.5">
                  <ShieldAlert size={18} className="shrink-0" />
                  <p>{voice.error}</p>
                </div>
                <button className="icon-button" aria-label="Dismiss error" onClick={voice.clearError}>
                  <X size={15} />
                </button>
              </div>
            )}
            {voice.notice && (
              <div role="status" className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-border bg-muted/60 text-foreground text-sm">
                <div className="flex items-center gap-2.5">
                  <Activity size={18} className="shrink-0 text-muted-foreground" />
                  <p>{voice.notice}</p>
                </div>
                <button className="icon-button" aria-label="Dismiss notice" onClick={voice.clearNotice}>
                  <X size={15} />
                </button>
              </div>
            )}

            {/* 4 Bento Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Incident overview">
              {/* Card 1: Active Incident */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0 p-3">
                  <CardTitle className="eyebrow">Active Incident</CardTitle>
                  <Badge variant={status === 'RESOLVED' ? 'success' : voice.incident ? 'destructive' : 'secondary'} className="text-[10px] uppercase font-bold tracking-wider">
                    {voice.incident?.severity ?? 'Awaiting session'}
                  </Badge>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="text-sm font-bold truncate text-foreground" title={voice.incident?.title}>
                    {voice.incident?.title.replace(/^P\d:\s*/, '') ?? 'Your investigation starts here'}
                  </div>
                  <p className="mono text-[11px] text-muted-foreground mt-0.5">
                    {voice.incident?.id ?? 'INC-STANDBY'}
                  </p>
                </CardContent>
              </Card>

              {/* Card 2: Incident Status */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0 p-3">
                  <CardTitle className="eyebrow">Triage Status</CardTitle>
                  <span className={`w-2 h-2 rounded-full ${status === 'RESOLVED' ? 'bg-emerald-500' : voice.incident ? 'bg-amber-500 animate-pulse' : 'bg-zinc-600'}`} />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="text-sm font-bold capitalize text-foreground">
                    {status ? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ') : 'Session Standby'}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {simulation ? 'Demo simulation · no live changes' : voice.operator ? `${voice.operator.infrastructure_mode} infrastructure` : 'Connecting to server'}
                  </p>
                </CardContent>
              </Card>

              {/* Card 3: Needs Attention */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0 p-3">
                  <CardTitle className="eyebrow">Needs Attention</CardTitle>
                  <AlertTriangle size={14} className="text-amber-500" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className={`text-xl font-bold ${unresolved ? 'text-amber-400' : 'text-foreground'}`}>
                    {services.length ? unresolved : '—'}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {critical ? `${critical} active critical services` : 'Services requiring triage'}
                  </p>
                </CardContent>
              </Card>

              {/* Card 4: Cluster Health */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0 p-3">
                  <CardTitle className="eyebrow">Cluster Health</CardTitle>
                  <CheckCircle2 size={14} className={healthy === services.length && services.length > 0 ? 'text-emerald-500' : 'text-muted-foreground'} />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className={`text-xl font-bold ${healthy === services.length && services.length > 0 ? 'text-emerald-400' : 'text-foreground'}`}>
                    {services.length ? `${healthy} / ${services.length}` : '—'}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {simulation ? 'Healthy in this scenario' : 'Verified healthy services'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Staged Remediation Approval Alert */}
            {voice.stagedRemediation && (
              <ApprovalCard
                action={voice.stagedRemediation}
                disabled={disabled}
                onApprove={voice.authorizeRemediation}
                onCancel={voice.cancelRemediation}
              />
            )}

            {/* Main Workspace Grid: Left Copilot (col-5) & Right Diagnostics (col-7) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Copilot & Conversation */}
              <div className="lg:col-span-5 w-full">
                <LiveTranscriptHUD
                  turns={voice.turns}
                  interimTranscript={voice.currentInterimTranscript}
                  agentTranscript={voice.currentAgentTranscript}
                  isRecording={voice.isRecording}
                  audioLevel={voice.audioLevel}
                  agentStatus={voice.isPlaying ? 'speaking' : voice.agentStatus}
                  disabled={disabled}
                  voiceAvailable={!!voice.operator?.assemblyai_configured}
                  isConnected={voice.isConnected}
                  providerState={voice.providerState}
                  providerMessage={voice.providerMessage}
                  onToggleRecording={voice.toggleRecording}
                  onSendText={voice.sendTextCommand}
                  onBargeIn={voice.bargeIn}
                />
              </div>

              {/* Right Column: Diagnostics, Tools & Activity */}
              <div className="lg:col-span-7 flex flex-col gap-6 w-full min-w-0">
                {/* Diagnostic Panel */}
                <Card className="border shadow-sm overflow-hidden" role="region" aria-label="Investigation tools">
                  <CardHeader className="border-b border-border/80 p-4 pb-3">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <p className="eyebrow">INVESTIGATE</p>
                        <h2 className="text-base font-semibold tracking-tight text-foreground">The bigger picture</h2>
                      </div>
                      <Badge variant="outline" className="font-mono text-xs">
                        {services.length} services
                      </Badge>
                    </div>

                    <nav className="view-tabs" aria-label="Investigation views">
                      {tabs.map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={view === id}
                          onClick={() => setView(id)}
                        >
                          <Icon size={14} />
                          <span>{label}</span>
                          {id === 'runbooks' && voice.activeRunbook?.status === 'active' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          )}
                        </button>
                      ))}
                    </nav>
                  </CardHeader>

                  <CardContent className="p-4 min-h-[380px]">
                    {view === 'brief' && (
                      <InvestigationPanel
                        brief={voice.investigation ?? null}
                        checks={voice.recoveryChecks ?? []}
                        disabled={disabled}
                        onCommand={voice.sendTextCommand}
                      />
                    )}
                    {view === 'services' && (
                      <ServiceHealthMatrix
                        services={voice.services}
                        infrastructureMode={voice.operator?.infrastructure_mode}
                        onInspect={service => voice.sendTextCommand(`Inspect logs for ${service}`)}
                        disabled={disabled}
                      />
                    )}
                    {view === 'topology' && (
                      <ServiceDependencyGraph
                        topology={voice.topology}
                        onSendAction={disabled ? undefined : voice.sendTextCommand}
                      />
                    )}
                    {view === 'runbooks' && (
                      <RunbookWorkflowHUD
                        activeRunbook={voice.activeRunbook}
                        disabled={disabled || !!voice.stagedRemediation}
                        onStartRunbook={voice.startRunbook}
                        onAdvanceRunbook={voice.advanceRunbook}
                        onAbortRunbook={voice.abortRunbook}
                      />
                    )}
                    {view === 'demo' && simulation && (
                      <LiveTelemetryDrawer
                        onTriggerChaos={voice.simulateScenario}
                        disabled={disabled}
                      />
                    )}
                  </CardContent>
                </Card>

                {/* Session Activity & Audit Trail */}
                <Card className="border shadow-sm overflow-hidden" role="region" aria-label="Session activity">
                  <CardHeader className="border-b border-border/80 p-4 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Activity size={16} className="text-primary" />
                      <span>Session activity</span>
                    </CardTitle>
                    <div className="inline-flex items-center p-0.5 rounded-md bg-muted text-xs">
                      <button
                        type="button"
                        className={`px-2.5 py-1 rounded-sm font-medium transition-all ${
                          activityView === 'tools'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        aria-pressed={activityView === 'tools'}
                        onClick={() => setActivityView('tools')}
                      >
                        Actions <span className="ml-1 px-1.5 py-0.2 rounded-full bg-secondary text-[10px]">{voice.executedTools.length}</span>
                      </button>
                      <button
                        type="button"
                        className={`px-2.5 py-1 rounded-sm font-medium transition-all ${
                          activityView === 'timeline'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        aria-pressed={activityView === 'timeline'}
                        onClick={() => setActivityView('timeline')}
                      >
                        Timeline
                      </button>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 max-h-[360px] overflow-y-auto">
                    {activityView === 'timeline' ? (
                      <IncidentTimeline incident={voice.incident} />
                    ) : voice.executedTools.length ? (
                      <div className="space-y-3">
                        {[...voice.executedTools].reverse().map(tool => (
                          <ToolExecutionCard key={tool.id} tool={tool} />
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center flex flex-col items-center justify-center text-muted-foreground">
                        <Wrench size={22} className="mb-2 text-muted-foreground/60" />
                        <h3 className="text-sm font-medium text-foreground">Your actions, in one place</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Checks and remediation results appear here as you investigate.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}

        {/* Global Footer */}
        <footer className="border-t border-border/80 pt-4 mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground" aria-label="Connection and provider status">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${voice.isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span>{voice.isConnected ? 'Server connected' : 'Server disconnected'}</span>
            <button
              type="button"
              className="text-button inline-flex items-center gap-1 hover:text-foreground font-medium ml-1"
              onClick={voice.reconnect}
            >
              <RefreshCw size={11} />
              <span>Reconnect</span>
            </button>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span>Reasoning: <strong className="text-foreground">{reasoning}</strong></span>
            <span className="text-border">/</span>
            <span className="text-muted-foreground font-medium">Voice & reports by AssemblyAI</span>
          </div>
        </footer>
      </main>

      {/* Post-Incident Report Modal */}
      {reportOpen && voice.postMortem && (
        <PostMortemViewer data={voice.postMortem} onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
}

export const App: React.FC = () => (
  <ErrorBoundary>
    <Workspace />
  </ErrorBoundary>
);

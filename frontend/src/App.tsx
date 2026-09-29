import React, { useEffect, useState } from 'react';
import {
  Activity, ArrowUpRight, FileText, FlaskConical,
  Layers, LockKeyhole, Network, RefreshCw, Settings, ShieldAlert, Sparkles, Wrench, X,
  CheckCircle2, PanelRightOpen
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
  const [activityView, setActivityView] = useState<'tools' | 'timeline'>('tools');
  const [reportOpen, setReportOpen] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  
  // Diagnostics render as cards inside the conversation. `view` selects which
  // panel is shown; there is no separate side canvas.
  const [view, setView] = useState<View>('brief');

  const simulation = voice.operator?.infrastructure_mode === 'simulation';
  const disabled = !voice.isConnected || voice.busy;
  const services = Object.values(voice.services);
  const healthy = services.filter(s => s.status === 'healthy').length;

  // Surface the relevant panel when an SRE event makes one meaningful.
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

  const subtitleText = simulation
    ? 'Demo simulation · no live changes'
    : voice.operator
    ? `${voice.operator.infrastructure_mode} infrastructure`
    : 'Connecting to server';

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-muted selection:text-foreground overflow-x-hidden">
      <a className="skip-link" href="#workspace">Skip to workspace</a>
      
      {/* Sleek Top Header with Navigation & Settings */}
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

      {/* Main Workspace View */}
      <main id="workspace" className="flex-1 flex flex-col w-full min-h-0 relative">
        {activePage === 'settings' ? (
          <div className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 overflow-y-auto">
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
          </div>
        ) : activePage === 'usage' ? (
          <div className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 overflow-y-auto">
            <UsageAnalyticsView
              onNavigateBack={() => setActivePage('mission_control')}
              latency={voice.latency}
              turns={voice.turns}
              executedTools={voice.executedTools}
              isRecording={voice.isRecording}
              audioLevel={voice.audioLevel}
              incidentId={voice.incident?.id}
            />
          </div>
        ) : (
          /* ── Mission Control: ChatGPT Voice Experience ── */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Context Actions Strip */}
            <div className="border-b border-border/40 bg-card/40 backdrop-blur-sm px-4 sm:px-6 py-2 shrink-0">
              <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${voice.isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className="eyebrow text-muted-foreground text-[10px] hidden sm:inline">OPERATIONS / INCIDENT WORKSPACE</span>
                    <span className="text-border hidden sm:inline">·</span>
                    <span className="text-xs text-muted-foreground font-mono truncate">
                      {subtitleText}
                    </span>
                  </div>
                  <h1 className="text-sm sm:text-base font-bold tracking-tight text-foreground leading-tight mt-0.5">
                    Less typing. Faster triage.
                  </h1>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    disabled={disabled || !voice.incident}
                    onClick={() => {
                      setView('brief');
                      voice.sendTextCommand('Investigate the incident');
                    }}
                    className="gap-1.5 rounded-xl h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                  >
                    <Sparkles size={12} />
                    <span>Investigate incident</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled || !voice.incident}
                    onClick={report}
                    className="gap-1.5 rounded-xl h-7 px-2.5 text-xs border-border/70 hover:bg-secondary/60 hidden sm:inline-flex"
                  >
                    <FileText size={12} />
                    <span>{voice.postMortem ? 'Open incident report' : 'Create incident report'}</span>
                    <ArrowUpRight size={11} className="text-muted-foreground" />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setView(v => (v === 'brief' ? 'services' : 'brief'))}
                    className="h-7 px-2.5 rounded-xl text-xs border-border/60 gap-1.5"
                    aria-label="Toggle diagnostics"
                    title="Show diagnostics"
                  >
                    <PanelRightOpen size={13} />
                    <span className="hidden md:inline">Diagnostics</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActivePage('settings')}
                    className="h-7 w-7 p-0 rounded-xl hover:bg-secondary/60"
                    aria-label="System Settings"
                    title="Settings"
                  >
                    <Settings size={14} />
                  </Button>
                </div>
              </div>
            </div>

            {/* Banners & Alerts */}
            <div className="max-w-3xl mx-auto w-full px-4 pt-2 space-y-2 shrink-0">
              {/* Operator Login Modal */}
              {voice.loginRequired && (
                <Card className="max-w-md mx-auto border-border bg-card shadow-lg p-6 my-6">
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
                    try { await voice.login(accessToken); setAccessToken(''); }
                    finally { setSigningIn(false); }
                  }} className="space-y-4">
                    <div>
                      <label className="sr-only" htmlFor="operator-token">Operator access token</label>
                      <input
                        id="operator-token" type="password"
                        placeholder="Operator access token"
                        autoComplete="current-password"
                        value={accessToken}
                        onChange={e => setAccessToken(e.target.value)}
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

              {/* Error Notice */}
              {voice.error && (
                <div role="alert" className="flex items-center justify-between gap-3 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert size={16} className="shrink-0" />
                    <p>{voice.error}</p>
                  </div>
                  <button className="icon-button" aria-label="Dismiss error" onClick={voice.clearError}><X size={14} /></button>
                </div>
              )}

              {/* Notice Banner */}
              {voice.notice && (
                <div role="status" className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-muted/60 text-foreground text-xs">
                  <div className="flex items-center gap-2.5">
                    <Activity size={16} className="shrink-0 text-muted-foreground" />
                    <p>{voice.notice}</p>
                  </div>
                  <button className="icon-button" aria-label="Dismiss notice" onClick={voice.clearNotice}><X size={14} /></button>
                </div>
              )}

            </div>

            {/* Single chat surface. Evidence, approval and receipts render as
                cards at the end of the conversation, inside the transcript. */}
            <div className="flex-1 flex flex-col min-h-0 w-full">
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
                inlineCards={
                  <div className="space-y-3 max-w-2xl mx-auto w-full">
                    {/* Guardrail: an approval is required before anything destructive runs */}
                    {voice.stagedRemediation && (
                      <ApprovalCard
                        action={voice.stagedRemediation}
                        disabled={disabled}
                        onApprove={voice.authorizeRemediation}
                        onCancel={voice.cancelRemediation}
                      />
                    )}

                    {/* Diagnostics */}
                    <Card className="border border-border/80 shadow-sm overflow-hidden" role="region" aria-label="Investigation tools">
                      <CardHeader className="border-b border-border/80 p-2.5 px-3 shrink-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="eyebrow">DIAGNOSTICS</p>
                            <Badge variant="outline" className="font-mono text-[10px] shrink-0">{services.length} services</Badge>
                            {healthy === services.length && services.length > 0 && (
                              <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                            )}
                          </div>
                        </div>
                        <nav className="view-tabs mt-2" aria-label="Investigation views">
                          {tabs.map(({ id, label, icon: Icon }) => (
                            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}>
                              <Icon size={13} />
                              <span>{label}</span>
                              {id === 'runbooks' && voice.activeRunbook?.status === 'active' && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              )}
                            </button>
                          ))}
                        </nav>
                      </CardHeader>

                      <CardContent className="p-3">
                        {view === 'brief' && (
                          <InvestigationPanel brief={voice.investigation ?? null} checks={voice.recoveryChecks ?? []} disabled={disabled} onCommand={voice.sendTextCommand} />
                        )}
                        {view === 'services' && (
                          <ServiceHealthMatrix services={voice.services} infrastructureMode={voice.operator?.infrastructure_mode} onInspect={s => voice.sendTextCommand(`Inspect logs for ${s}`)} disabled={disabled} />
                        )}
                        {view === 'topology' && (
                          <ServiceDependencyGraph topology={voice.topology} onSendAction={disabled ? undefined : voice.sendTextCommand} />
                        )}
                        {view === 'runbooks' && (
                          <RunbookWorkflowHUD activeRunbook={voice.activeRunbook} disabled={disabled || !!voice.stagedRemediation} onStartRunbook={voice.startRunbook} onAdvanceRunbook={voice.advanceRunbook} onAbortRunbook={voice.abortRunbook} />
                        )}
                        {view === 'demo' && simulation && (
                          <LiveTelemetryDrawer onTriggerChaos={voice.simulateScenario} disabled={disabled} />
                        )}
                      </CardContent>
                    </Card>

                    {/* Session activity / audit ledger */}
                    <Card className="border border-border/80 shadow-sm overflow-hidden" role="region" aria-label="Session activity">
                      <CardHeader className="border-b border-border/80 p-2.5 px-3 flex flex-row items-center justify-between space-y-0 shrink-0">
                        <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                          <Activity size={14} className="text-primary" />
                          <span>Session activity</span>
                        </CardTitle>
                        <div className="inline-flex items-center p-0.5 rounded-md bg-muted text-[11px]">
                          <button type="button" aria-pressed={activityView === 'tools'} onClick={() => setActivityView('tools')}
                            className={`px-2 py-0.5 rounded-sm font-medium transition-all ${activityView === 'tools' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                            Actions <span className="ml-1 px-1 py-0.2 rounded-full bg-secondary text-[9px]">{voice.executedTools.length}</span>
                          </button>
                          <button type="button" aria-pressed={activityView === 'timeline'} onClick={() => setActivityView('timeline')}
                            className={`px-2 py-0.5 rounded-sm font-medium transition-all ${activityView === 'timeline' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                            Timeline
                          </button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-3 max-h-[220px] overflow-y-auto">
                        {activityView === 'timeline' ? (
                          <IncidentTimeline incident={voice.incident} />
                        ) : voice.executedTools.length ? (
                          <div className="space-y-2">
                            {[...voice.executedTools].reverse().map(tool => (
                              <ToolExecutionCard key={tool.id} tool={tool} />
                            ))}
                          </div>
                        ) : (
                          <div className="py-4 text-center flex flex-col items-center justify-center text-muted-foreground text-xs">
                            <Wrench size={18} className="mb-1 text-muted-foreground/60" />
                            <p className="font-medium text-foreground">Action audit ledger</p>
                            <p className="text-[10px] text-muted-foreground">Checks and tool outputs will appear here.</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                }
              />
            </div>

            {/* Global Minimal Footer */}
            <footer className="border-t border-border/40 py-2 px-4 flex items-center justify-between text-[11px] text-muted-foreground shrink-0 bg-card/30">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${voice.isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span>{voice.isConnected ? 'Server online' : 'Server disconnected'}</span>
                <button type="button" className="text-button inline-flex items-center gap-1 hover:text-foreground font-medium ml-1" onClick={voice.reconnect}>
                  <RefreshCw size={10} /><span>Reconnect</span>
                </button>
              </div>
              <div className="flex items-center gap-2 font-mono text-[10px]">
                <span>Engine: <strong className="text-foreground">{reasoning}</strong></span>
                <span className="text-border">/</span>
                <span>AssemblyAI Universal-3 Pro</span>
              </div>
            </footer>
          </div>
        )}
      </main>

      {/* Post-Incident Review Modal */}
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

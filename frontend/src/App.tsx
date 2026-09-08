import React, { useState, useEffect } from 'react';
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
import { Wrench, FileText, ShieldAlert, Network, LayoutGrid } from 'lucide-react';

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0d14] text-slate-200 flex flex-col items-center justify-center p-6 text-center font-sans">
          <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">System Failure Detected</h1>
          <p className="text-sm text-slate-400 mb-6 max-w-md">{this.state.error?.message || 'An unexpected error occurred in the mission control console.'}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-semibold transition border border-slate-700"
          >
            Reload Interface
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const App: React.FC = () => {
  const {
    isConnected,
    agentStatus,
    activeEngine,
    autopilotEnabled,
    stagedRemediation,
    dockerActive,
    rbacRole,
    clusterProvider,
    isRecording,
    turns,
    currentInterimTranscript,
    executedTools,
    incident,
    services,
    topology,
    activeRunbook,
    postMortem,
    audioLevel,
    latency,
    toggleRecording,
    sendTextCommand,
    selectEngine,
    authorizeRemediation,
    cancelRemediation,
    resetIncident,
    bargeIn,
    startRunbook,
    advanceRunbook,
    abortRunbook,
    toggleAutopilot,
    closePostMortem
  } = useVoiceStream();

  const [isPostMortemOpen, setIsPostMortemOpen] = useState(false);
  const [activeRightView, setActiveRightView] = useState<'topology' | 'matrix' | 'runbooks' | 'chaos'>('topology');

  // Automatically switch tab when runbook becomes active
  useEffect(() => {
    if (activeRunbook && activeRunbook.status === 'active') {
      setActiveRightView('runbooks');
    }
  }, [activeRunbook]);

  // Automatically open modal when a new postmortem is synthesized
  useEffect(() => {
    if (postMortem) {
      setIsPostMortemOpen(true);
    }
  }, [postMortem]);

  const handleTriggerChaos = (scenario: string) => {
    switch (scenario) {
      case 'crash_payment':
        sendTextCommand("Simulate Sev-1 crash on payment service");
        break;
      case 'starve_db':
        sendTextCommand("Simulate database connection pool exhaustion on order db");
        break;
      case 'traffic_spike':
        sendTextCommand("Simulate traffic spike on ingress gateway");
        break;
      case 'heal_all':
        sendTextCommand("Restart failing pods and restore all nominal health");
        break;
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#06080e] flex flex-col font-sans text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
        {/* Top Header Bar with Dual-Engine Architecture Selector */}
        <MissionControlHeader
          incident={incident}
          agentStatus={agentStatus}
          isConnected={isConnected}
          latency={latency}
          activeEngine={activeEngine}
          dockerActive={dockerActive}
          rbacRole={rbacRole}
          clusterProvider={clusterProvider}
          autopilotEnabled={autopilotEnabled}
          onToggleAutopilot={toggleAutopilot}
          onSelectEngine={selectEngine}
          onReset={resetIncident}
        />

        {/* Main Mission Control Cockpit */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 flex flex-col gap-4">
          {/* Two-Phase SRE Safety Guardrail Authorization Banner (Appears only when staged) */}
          {stagedRemediation && (
            <div className="bg-gradient-to-r from-amber-950/80 via-slate-900/90 to-amber-950/80 border-2 border-amber-500/80 p-4 sm:p-5 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-xl glow-amber animate-pulse">
              <div className="flex items-center gap-3.5 text-left">
                <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-inner">
                  <ShieldAlert className="w-7 h-7 animate-bounce" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-white tracking-wider uppercase font-mono">
                      Two-Phase SRE Safety Guardrail Engaged
                    </h3>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-900/80 text-amber-200 border border-amber-500/60 font-mono font-bold shadow-sm">
                      AWAITING OPERATOR VERIFICATION
                    </span>
                  </div>
                  <p className="text-xs text-amber-100 mt-1 font-mono">
                    Staged mutation: <strong className="text-white underline decoration-amber-400 font-semibold">{stagedRemediation.action}</strong> on <strong className="text-white underline decoration-amber-400 font-semibold">{stagedRemediation.service_name}</strong>.
                  </p>

                  {stagedRemediation.challenge_code ? (
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-amber-300 font-mono">Vocal Challenge:</span>
                      <span className="px-3 py-1 rounded-xl bg-amber-900/90 text-amber-100 border border-amber-400 font-mono font-extrabold text-xs tracking-widest shadow-md glow-amber">
                        {stagedRemediation.challenge_code}
                      </span>
                      <span className="text-[10px] text-amber-300/80 font-mono">(Speak NATO phonetic code or click Authorize)</span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-300/80 mt-1.5 font-mono">
                      Say &ldquo;Confirm&rdquo; or click Authorize to execute mutation.
                    </p>
                  )}

                  {stagedRemediation.hardware_mfa_required && (
                    <div className="mt-2.5 flex items-center gap-2 bg-red-950/90 px-3 py-1.5 rounded-xl border border-red-500/60 text-xs text-red-200 font-mono">
                      <span className="text-base animate-bounce">🔑</span>
                      <span>Hardware FIDO2 Security Key Required. Touch your physical YubiKey authenticator.</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end flex-shrink-0">
                <button
                  onClick={cancelRemediation}
                  className="px-4 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/[0.08] text-xs font-semibold transition cursor-pointer"
                >
                  Cancel / Abort
                </button>
                {stagedRemediation.hardware_mfa_required ? (
                  <button
                    onClick={authorizeRemediation}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs shadow-lg shadow-red-600/40 border border-red-500 transition animate-pulse flex items-center gap-2 cursor-pointer hover:scale-105 active:scale-95"
                  >
                    <span>🔑 Touch Security Key</span>
                  </button>
                ) : (
                  <button
                    onClick={authorizeRemediation}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/40 border border-emerald-400 transition animate-pulse cursor-pointer hover:scale-105 active:scale-95 glow-green"
                  >
                    Authorize Mutation
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 2-Column High-Impact Cockpit Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-stretch">
            {/* Left Column: Voice Commander Terminal HUD */}
            <div className="lg:col-span-5 min-h-[500px] lg:h-[720px]">
              <LiveTranscriptHUD
                turns={turns}
                interimTranscript={currentInterimTranscript}
                isRecording={isRecording}
                audioLevel={audioLevel}
                agentStatus={agentStatus}
                onToggleRecording={toggleRecording}
                onSendText={sendTextCommand}
                onBargeIn={bargeIn}
              />
            </div>

            {/* Right Column: SRE Diagnostic War Room & Orchestration */}
            <div className="lg:col-span-7 flex flex-col gap-4 h-full">
              {/* Unified 4-Tab Diagnostic Bar */}
              <div className="glass-panel p-1.5 px-2 rounded-2xl flex items-center justify-between gap-2 overflow-x-auto border border-white/[0.08]">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveRightView('topology')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      activeRightView === 'topology'
                        ? 'bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-cyan-500/20 text-cyan-200 border border-cyan-500/50 shadow-md shadow-cyan-500/10 font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Network className="w-3.5 h-3.5" />
                    <span>Dependency Topology</span>
                  </button>

                  <button
                    onClick={() => setActiveRightView('matrix')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      activeRightView === 'matrix'
                        ? 'bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-cyan-500/20 text-cyan-200 border border-cyan-500/50 shadow-md shadow-cyan-500/10 font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Health Matrix</span>
                  </button>

                  <button
                    onClick={() => setActiveRightView('runbooks')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition relative cursor-pointer ${
                      activeRightView === 'runbooks'
                        ? 'bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-cyan-500/20 text-cyan-200 border border-cyan-500/50 shadow-md shadow-cyan-500/10 font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>SRE Runbooks</span>
                    {activeRunbook && activeRunbook.status === 'active' && (
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                    )}
                  </button>

                  <button
                    onClick={() => setActiveRightView('chaos')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      activeRightView === 'chaos'
                        ? 'bg-gradient-to-r from-red-500/20 via-rose-500/20 to-red-500/20 text-red-300 border border-red-500/50 shadow-md shadow-red-500/10 font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                    <span>Chaos Simulator</span>
                  </button>
                </div>

                <span className="text-[10px] font-mono text-slate-400 hidden sm:flex items-center gap-1.5 pr-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Multi-Cluster K8s Mesh
                </span>
              </div>

              {/* Upper War Room Viewport (Interactive View) */}
              <div className="min-h-[340px] flex-1">
                {activeRightView === 'topology' && (
                  <ServiceDependencyGraph
                    topology={topology}
                    onSendAction={sendTextCommand}
                  />
                )}

                {activeRightView === 'matrix' && (
                  <ServiceHealthMatrix services={services} />
                )}

                {activeRightView === 'runbooks' && (
                  <RunbookWorkflowHUD
                    activeRunbook={activeRunbook}
                    onStartRunbook={startRunbook}
                    onAdvanceRunbook={advanceRunbook}
                    onAbortRunbook={abortRunbook}
                  />
                )}

                {activeRightView === 'chaos' && (
                  <LiveTelemetryDrawer
                    onTriggerChaos={handleTriggerChaos}
                    onLaunchDocker={() => {}}
                  />
                )}
              </div>

              {/* Lower Deck: Executed SRE Tools & Incident Timeline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-[260px]">
                {/* Executed Tools Feed */}
                <div className="glass-panel rounded-2xl p-4 shadow-xl flex flex-col h-full border border-white/[0.08]">
                  <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-cyan-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-sans">
                        Executed Tools Stream
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded-full font-semibold">
                      {executedTools.length} calls
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {executedTools.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs font-mono">
                        <span>Awaiting autonomous tool calls...</span>
                      </div>
                    ) : (
                      executedTools.map((tool) => (
                        <ToolExecutionCard key={tool.id} tool={tool} />
                      ))
                    )}
                  </div>
                </div>

                {/* Incident Event Timeline */}
                <div className="h-full">
                  <IncidentTimeline incident={incident} />
                </div>
              </div>

              {/* Quick Post-Mortem Action Banner */}
              {postMortem && (
                <div className="bg-gradient-to-r from-cyan-950/70 via-slate-900/90 to-purple-950/70 border border-cyan-400/50 p-3.5 rounded-2xl flex items-center justify-between shadow-2xl glow-cyan animate-in fade-in backdrop-blur-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white tracking-wide">
                        Post-Incident Review & Acoustic Black Box Synthesized
                      </h4>
                      <p className="text-[11px] text-slate-300">
                        4 Certified Artifacts: Markdown PIR, Jira Tickets, Slack Briefing & Audio Replay
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsPostMortemOpen(true)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-500/30 cursor-pointer hover:scale-105 active:scale-95"
                  >
                    Open Incident Review
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Post-Mortem Fullscreen Modal with 4 Distinct Artifact Tabs */}
        {isPostMortemOpen && (
          <PostMortemViewer
            data={postMortem}
            onClose={() => {
              setIsPostMortemOpen(false);
              closePostMortem();
            }}
          />
        )}
      </div>
    </ErrorBoundary>
  );
};

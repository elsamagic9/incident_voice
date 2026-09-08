import React, { useState, useEffect } from 'react';
import { useVoiceStream } from './hooks/useVoiceStream';
import { MissionControlHeader } from './components/MissionControlHeader';
import { AudioOscilloscope } from './components/AudioOscilloscope';
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
  const [activeRightView, setActiveRightView] = useState<'topology' | 'matrix'>('topology');

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
      <div className="min-h-screen bg-[#0a0d14] flex flex-col font-sans text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
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

      {/* Main Mission Control Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-4">
        {/* Oscilloscope Audio Stream Visualizer */}
        <AudioOscilloscope
          isRecording={isRecording}
          audioLevel={audioLevel}
          agentSpeaking={agentStatus === 'speaking'}
        />

        {/* Two-Phase SRE Safety Guardrail Authorization Banner */}
        {stagedRemediation && (
          <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border-2 border-amber-500/80 p-4 rounded-xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse glow-amber">
            <div className="flex items-center gap-3 text-left">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
                <ShieldAlert className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                    Two-Phase SRE Safety Guardrail Triggered
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700 font-mono">
                    Awaiting Engineer Authorization
                  </span>
                </div>
                <p className="text-xs text-amber-200 mt-1 font-mono">
                  Remediation staged: <strong className="text-white underline">{stagedRemediation.action}</strong> on <strong className="text-white underline">{stagedRemediation.service_name}</strong>.
                </p>
                {stagedRemediation.challenge_code ? (
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-amber-300">Vocal Challenge:</span>
                    <span className="px-2 py-0.5 rounded bg-amber-900/90 text-amber-100 border border-amber-500 font-mono font-bold text-xs tracking-wider shadow-inner">
                      {stagedRemediation.challenge_code}
                    </span>
                    <span className="text-[10px] text-amber-300/80">(Speak military code or click Authorize)</span>
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-300/80 mt-0.5 font-mono">
                    Say &ldquo;Confirm&rdquo; or click Authorize to execute.
                  </p>
                )}
                {stagedRemediation.hardware_mfa_required && (
                  <div className="mt-2 flex items-center gap-2 bg-red-950/80 p-1.5 rounded border border-red-500/50">
                    <span className="text-xl animate-bounce">🔑</span>
                    <span className="text-xs font-bold text-red-200">Hardware FIDO2 Security Key Required. Please touch your authenticator.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                onClick={cancelRemediation}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition"
              >
                Cancel / Abort
              </button>
              {stagedRemediation.hardware_mfa_required ? (
                <button
                  onClick={authorizeRemediation}
                  className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-600/30 border border-red-500 transition animate-pulse flex items-center gap-2"
                >
                  <span>🔑 Touch Security Key to Authorize</span>
                </button>
              ) : (
                <button
                  onClick={authorizeRemediation}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 border border-emerald-500 transition animate-pulse"
                >
                  Authorize Execution
                </button>
              )}

            </div>
          </div>
        )}

        {/* Feature 1: Interactive SRE Runbook Workflow Engine Bar */}
        <RunbookWorkflowHUD
          activeRunbook={activeRunbook}
          onStartRunbook={startRunbook}
          onAdvanceRunbook={advanceRunbook}
          onAbortRunbook={abortRunbook}
        />

        {/* SRE Chaos Injection Controls */}
        <LiveTelemetryDrawer
          onTriggerChaos={handleTriggerChaos}
          onLaunchDocker={() => {}}
        />

        {/* 2-Column War-Room Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-stretch">
          {/* Left Column: Live Transcript HUD */}
          <div className="lg:col-span-5 min-h-[440px] lg:h-[640px]">
            <LiveTranscriptHUD
              turns={turns}
              interimTranscript={currentInterimTranscript}
              isRecording={isRecording}
              agentStatus={agentStatus}
              onToggleRecording={toggleRecording}
              onSendText={sendTextCommand}
              onBargeIn={bargeIn}
            />
          </div>

          {/* Right Column: SRE Topology & Incident Diagnostics */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* View Switcher Bar for Right Column */}
            <div className="flex items-center justify-between bg-slate-900/80 p-1.5 px-2 rounded-xl border border-slate-800">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider pl-1">
                Diagnostic Console View:
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveRightView('topology')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    activeRightView === 'topology'
                      ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Network className="w-3.5 h-3.5" />
                  <span>Dependency Topology & Blast Radius</span>
                </button>
                <button
                  onClick={() => setActiveRightView('matrix')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    activeRightView === 'matrix'
                      ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Service Health Matrix</span>
                </button>
              </div>
            </div>

            {/* Feature 2: Interactive Service Dependency Graph OR Matrix */}
            {activeRightView === 'topology' ? (
              <ServiceDependencyGraph
                topology={topology}
                onSendAction={sendTextCommand}
              />
            ) : (
              <ServiceHealthMatrix services={services} />
            )}

            {/* Split Lower Pane: Executed Tools & Incident Timeline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
              {/* Tool Execution Stream */}
              <div className="bg-[#101522] rounded-xl border border-slate-800 p-4 shadow-xl flex flex-col h-[280px]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Executed SRE Tools
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {executedTools.length} executed
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {executedTools.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center text-slate-500 text-xs">
                      Tools executed by voice agent will appear here
                    </div>
                  ) : (
                    executedTools.map((tool) => (
                      <ToolExecutionCard key={tool.id} tool={tool} />
                    ))
                  )}
                </div>
              </div>

              {/* Chronological Incident Event Timeline */}
              <div className="h-[280px]">
                <IncidentTimeline incident={incident} />
              </div>
            </div>

            {/* Quick Post-Mortem Review Banner */}
            {postMortem && (
              <div className="bg-gradient-to-r from-cyan-950/40 to-slate-900 border border-cyan-500/50 p-3.5 rounded-xl flex items-center justify-between shadow-lg glow-cyan">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-5 h-5 text-cyan-400" />
                  <div>
                    <h4 className="text-xs font-bold text-white">Post-Incident Review & Black Box Ready</h4>
                    <p className="text-[11px] text-slate-300">4 Artifacts: PIR Markdown, Jira Tickets, Slack Briefing, and Acoustic Replay</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPostMortemOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-md shadow-cyan-500/30"
                >
                  Open Black Box & Review
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

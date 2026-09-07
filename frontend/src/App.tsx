import React, { useState, useEffect } from 'react';
import { useVoiceStream } from './hooks/useVoiceStream';
import { MissionControlHeader } from './components/MissionControlHeader';
import { AudioOscilloscope } from './components/AudioOscilloscope';
import { LiveTranscriptHUD } from './components/LiveTranscriptHUD';
import { ServiceHealthMatrix } from './components/ServiceHealthMatrix';
import { IncidentTimeline } from './components/IncidentTimeline';
import { ToolExecutionCard } from './components/ToolExecutionCard';
import { PostMortemViewer } from './components/PostMortemViewer';
import { LiveTelemetryDrawer } from './components/LiveTelemetryDrawer';
import { Wrench, FileText, ShieldAlert, CheckCircle2 } from 'lucide-react';

export const App: React.FC = () => {
  const {
    isConnected,
    agentStatus,
    activeEngine,
    stagedRemediation,
    dockerActive,
    isRecording,
    turns,
    currentInterimTranscript,
    executedTools,
    incident,
    services,
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
    closePostMortem
  } = useVoiceStream();

  const [isPostMortemOpen, setIsPostMortemOpen] = useState(false);

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
    <div className="min-h-screen bg-[#0a0d14] flex flex-col font-sans text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Header Bar with Dual-Engine Architecture Selector */}
      <MissionControlHeader
        incident={incident}
        agentStatus={agentStatus}
        isConnected={isConnected}
        latency={latency}
        activeEngine={activeEngine}
        dockerActive={dockerActive}
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
                  Say &ldquo;Confirm&rdquo; or click Authorize to execute.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                onClick={cancelRemediation}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition"
              >
                Cancel / Abort
              </button>
              <button
                onClick={authorizeRemediation}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/30 transition flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Authorize Remediation
              </button>
            </div>
          </div>
        )}

        {/* SRE Chaos Injection Controls */}
        <LiveTelemetryDrawer
          onTriggerChaos={handleTriggerChaos}
          onLaunchDocker={() => {}}
        />

        {/* 2-Column War-Room Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-stretch">
          {/* Left Column: Live Transcript HUD */}
          <div className="lg:col-span-5 h-[620px]">
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
            {/* Microservice Health Matrix */}
            <ServiceHealthMatrix services={services} />

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
                    <h4 className="text-xs font-bold text-white">Post-Incident Review Ready</h4>
                    <p className="text-[11px] text-slate-300">Generated via AssemblyAI LeMUR (3 Formats: PIR, Jira JSON, Slack)</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPostMortemOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
                >
                  View Full Report
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Post-Mortem Fullscreen Modal with 3 Distinct Artifact Tabs */}
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
  );
};

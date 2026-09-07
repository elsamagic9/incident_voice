import React from 'react';
import { ShieldAlert, Wifi, Radio, RefreshCw, Zap, Cpu, Boxes, Bot, Sparkles } from 'lucide-react';
import { AgentStatus, IncidentRecord, VoiceEngine } from '../types';
import { LatencyStats } from '../hooks/useVoiceStream';

interface Props {
  incident: IncidentRecord | null;
  agentStatus: AgentStatus;
  isConnected: boolean;
  latency: LatencyStats;
  activeEngine: VoiceEngine;
  dockerActive?: boolean;
  rbacRole?: string;
  clusterProvider?: string;
  onSelectEngine: (engine: VoiceEngine) => void;
  onReset: () => void;
}

export const MissionControlHeader: React.FC<Props> = ({
  incident,
  agentStatus,
  isConnected,
  latency,
  activeEngine,
  dockerActive = false,
  rbacRole = 'SRE_COMMANDER',
  clusterProvider = 'Hybrid (K8s + Docker)',
  onSelectEngine,
  onReset
}) => {
  const getStatusBadge = () => {
    switch (agentStatus) {
      case 'speaking':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse">
            <Radio className="w-3.5 h-3.5" /> AGENT SPEAKING
          </span>
        );
      case 'thinking':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse">
            <Zap className="w-3.5 h-3.5" /> REASONING / TOOL CALL
          </span>
        );
      case 'interrupted':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            BARGE-IN / MUTED
          </span>
        );
      case 'awaiting_confirmation':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> AWAITING CONFIRMATION
          </span>
        );
      case 'listening':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/40">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" /> LISTENING
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            IDLE
          </span>
        );
    }
  };

  const getSeverityBadge = () => {
    const sev = incident?.severity || 'SEV-1';
    const isResolved = incident?.status === 'RESOLVED';
    if (isResolved) {
      return (
        <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 glow-green">
          INCIDENT RESOLVED
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/50 glow-red">
        {sev} ACTIVE OUTAGE
      </span>
    );
  };

  return (
    <header className="border-b border-slate-800 bg-[#0f172a]/90 backdrop-blur-md sticky top-0 z-30 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-wider text-base text-white">INCIDENT<span className="text-cyan-400">VOICE</span></span>
                {activeEngine === 'voice_agent_api' ? (
                  <span className="text-[10px] px-1.5 py-0.2 bg-cyan-950 text-cyan-300 rounded border border-cyan-800 font-mono">
                    Voice Agent API
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.2 bg-purple-950 text-purple-300 rounded border border-purple-800 font-mono">
                    Streaming v3 + LeMUR
                  </span>
                )}
                {dockerActive ? (
                  <span className="text-[10px] px-1.5 py-0.5 bg-emerald-950 text-emerald-300 rounded border border-emerald-800 font-mono flex items-center gap-1" title="Connected to live Docker daemon on host machine">
                    <Boxes className="w-3 h-3 text-emerald-400" /> Docker Live (Host)
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 bg-cyan-950/80 text-cyan-300 rounded border border-cyan-800/80 font-mono flex items-center gap-1" title="Running in Cloud Sandbox mode with stateful digital twin. Real Docker host socket active in local CLI mode.">
                    <Cpu className="w-3 h-3 text-cyan-400" /> Cloud Sandbox Active
                  </span>
                )}
                <span className="text-[10px] px-1.5 py-0.5 bg-indigo-950/90 text-indigo-300 rounded border border-indigo-800 font-mono flex items-center gap-1" title={`Orchestration Mesh: ${clusterProvider}`}>
                  <Boxes className="w-3 h-3 text-indigo-400" /> {clusterProvider}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 bg-amber-950/90 text-amber-300 rounded border border-amber-800 font-mono flex items-center gap-1" title={`Role-Based Access Control: ${rbacRole}`}>
                  <ShieldAlert className="w-3 h-3 text-amber-400" /> RBAC: {rbacRole}
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Autonomous Voice SRE & Incident Commander</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {getSeverityBadge()}
          </div>
        </div>

        {/* Center: Dual-Engine Architecture Selector (Path 1 vs Path 2) */}
        <div className="flex items-center bg-slate-900/90 p-1 rounded-lg border border-slate-800 text-xs shadow-inner">
          <button
            onClick={() => onSelectEngine('voice_agent_api')}
            title="Path 1: AssemblyAI Voice Agent API (wss://agents.assemblyai.com/v1/ws) with server-side LLM & tool-calling"
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
              activeEngine === 'voice_agent_api'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Path 1: Voice Agent API</span>
          </button>
          <button
            onClick={() => onSelectEngine('custom_stt_v3')}
            title="Path 2: AssemblyAI Streaming v3 STT + Custom Dynamic Orchestrator + LeMUR Synthesis"
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
              activeEngine === 'custom_stt_v3'
                ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-300" />
            <span>Path 2: STT v3 + LeMUR</span>
          </button>
        </div>

        {/* Right: Latency Breakdown & Controls */}
        <div className="flex items-center gap-3">
          <div className="hidden xl:flex items-center gap-2 bg-slate-900/90 px-3 py-1 rounded-lg border border-slate-800 text-[11px] font-mono">
            <Wifi className={`w-3.5 h-3.5 ${isConnected ? 'text-emerald-400' : 'text-red-400'}`} />
            <span className="text-slate-400">Latency:</span>
            <span className="text-slate-300">STT <strong className="text-cyan-300">{latency.stt_ms.toFixed(0)}ms</strong></span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-300">Tool <strong className="text-amber-300">{latency.tool_ms.toFixed(0)}ms</strong></span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-300">TTS <strong className="text-emerald-300">{latency.tts_ms.toFixed(0)}ms</strong></span>
            <span className="text-slate-600">=</span>
            <span className="px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-700 text-cyan-200 font-bold">
              {latency.total_ms.toFixed(0)}ms
            </span>
          </div>

          {getStatusBadge()}

          <button
            onClick={onReset}
            title="Reset Incident Simulation"
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
          >
            <RefreshCw className="w-3 h-3" /> Reset
          </button>
        </div>
      </div>
    </header>
  );
};

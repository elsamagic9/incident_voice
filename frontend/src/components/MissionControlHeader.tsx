import React from 'react';
import { ShieldAlert, Wifi, Radio, RefreshCw, Zap, Bot, Sparkles, CheckCircle2 } from 'lucide-react';
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
  autopilotEnabled?: boolean;
  onToggleAutopilot?: () => void;
  onSelectEngine: (engine: VoiceEngine) => void;
  onReset: () => void;
}

export const MissionControlHeader: React.FC<Props> = ({
  incident,
  agentStatus,
  isConnected,
  latency,
  activeEngine,
  dockerActive = true,
  rbacRole = 'SRE_COMMANDER',
  clusterProvider = 'Hybrid (K8s + Docker)',
  autopilotEnabled = false,
  onToggleAutopilot,
  onSelectEngine,
  onReset
}) => {
  const isResolved = incident?.status === 'RESOLVED';
  const sev = incident?.severity || 'SEV-1';

  return (
    <header className="border-b border-white/[0.08] bg-[#070a14]/90 backdrop-blur-2xl sticky top-0 z-40 px-4 py-2.5 shadow-2xl">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Branding, Outage Status & Host Pillar */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400/20 via-blue-500/20 to-purple-600/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-lg glow-cyan">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <span
                className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${
                  isResolved ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-red-500 shadow-[0_0_8px_#ef4444] animate-ping'
                }`}
              />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-wider text-base text-white font-sans">
                  INCIDENT<span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-400 bg-clip-text text-transparent">VOICE</span>
                </span>

                {/* Status Badge */}
                {isResolved ? (
                  <span className="flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm glow-green">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> ALL SYSTEMS NOMINAL
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-500/20 text-red-300 border border-red-500/50 shadow-sm glow-red animate-pulse">
                    <Radio className="w-3 h-3 text-red-400" /> {sev} ACTIVE OUTAGE
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mt-0.5">
                <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                  {dockerActive ? 'Docker Live (Host)' : 'Cloud Sandbox'}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-300">{clusterProvider}</span>
                <span className="text-slate-600">·</span>
                <span className="text-amber-300 font-semibold">{rbacRole}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Dual-Engine Architecture Segmented Pill */}
        <div className="flex items-center p-1 rounded-2xl bg-slate-900/90 border border-white/[0.08] shadow-inner">
          <button
            onClick={() => onSelectEngine('voice_agent_api')}
            title="Path 1: AssemblyAI Voice Agent API (wss://agents.assemblyai.com/v1/ws) with server-side LLM & JSON-Schema tool calling"
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeEngine === 'voice_agent_api'
                ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-slate-950 font-bold shadow-md shadow-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Path 1: Voice Agent API</span>
          </button>
          <button
            onClick={() => onSelectEngine('custom_stt_v3')}
            title="Path 2: AssemblyAI Streaming v3 STT + Custom Dynamic Orchestrator + Multi-Artifact LeMUR"
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeEngine === 'custom_stt_v3'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-200" />
            <span>Path 2: STT v3 + LeMUR</span>
          </button>
        </div>

        {/* Right: Latency Ticker, Autopilot Mode & Reset */}
        <div className="flex items-center gap-2.5">
          {/* Latency Ticker */}
          <div className="hidden xl:flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-white/[0.08] text-[11px] font-mono shadow-inner">
            <Wifi className={`w-3.5 h-3.5 ${isConnected ? 'text-emerald-400' : 'text-red-400'}`} />
            <span className="text-slate-400">Latency:</span>
            <span className="text-slate-300">STT <strong className="text-cyan-300">{latency.stt_ms.toFixed(0)}ms</strong></span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-300">Tool <strong className="text-amber-300">{latency.tool_ms.toFixed(0)}ms</strong></span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-300">TTS <strong className="text-emerald-300">{latency.tts_ms.toFixed(0)}ms</strong></span>
            <span className="text-slate-600">=</span>
            <span className="px-2 py-0.5 rounded-md bg-cyan-950 border border-cyan-500/60 text-cyan-200 font-bold glow-cyan">
              {latency.total_ms.toFixed(0)}ms
            </span>
          </div>

          {/* Agent Status Badge */}
          <span
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold border shadow-sm ${
              agentStatus === 'speaking'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 glow-green animate-pulse'
                : agentStatus === 'listening'
                ? 'bg-red-500/20 text-red-300 border-red-500/50 glow-red'
                : agentStatus === 'thinking'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 glow-cyan animate-pulse'
                : agentStatus === 'awaiting_confirmation'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 glow-amber animate-pulse'
                : 'bg-slate-900/90 text-slate-400 border-white/[0.08]'
            }`}
          >
            <Radio className="w-3 h-3" />
            <span className="uppercase">{agentStatus}</span>
          </span>

          {/* Autopilot Self-Healing Toggle */}
          {onToggleAutopilot && (
            <button
              onClick={onToggleAutopilot}
              title="Toggle Autonomous Autopilot Mode to bypass manual confirmation gates"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold rounded-xl border transition-all shadow-md cursor-pointer ${
                autopilotEnabled
                  ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-400 shadow-red-600/40 glow-red animate-pulse'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-white/[0.08] hover:border-white/20'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${autopilotEnabled ? 'text-white fill-current' : 'text-slate-400'}`} />
              <span>{autopilotEnabled ? 'AUTOPILOT ON' : 'AUTOPILOT'}</span>
            </button>
          )}

          {/* Reset Incident Session */}
          <button
            onClick={onReset}
            title="Reset Incident Session to Initial Broken State"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-white/[0.08] hover:border-white/20 transition shadow-sm cursor-pointer hover:scale-105 active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>
    </header>
  );
};

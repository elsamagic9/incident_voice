import React from 'react';
import {
  AudioLines, Zap, Sliders,
  Activity, Radio, Cpu, BarChart3, LayoutDashboard
} from 'lucide-react';
import { AgentStatus, IncidentRecord, VoiceEngine } from '../types';
import { LatencyStats } from '../hooks/useVoiceStream';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type ActivePage = 'mission_control' | 'usage' | 'settings';

interface Props {
  incident: IncidentRecord | null;
  agentStatus: AgentStatus;
  isConnected: boolean;
  latency: LatencyStats;
  activeEngine: VoiceEngine;
  providerState?: string;
  providerErrorCode?: string | null;
  busy?: boolean;
  autopilotEnabled?: boolean;
  onToggleAutopilot?: () => void;
  onSelectEngine: (engine: VoiceEngine) => void;
  activePage?: ActivePage;
  onNavigate?: (page: ActivePage) => void;
}

export const MissionControlHeader: React.FC<Props> = ({
  isConnected,
  latency,
  activeEngine,
  providerState = 'idle',
  providerErrorCode,
  busy,
  autopilotEnabled,
  onToggleAutopilot,
  onSelectEngine,
  agentStatus,
  activePage = 'mission_control',
  onNavigate,
}) => {
  const disabled = !isConnected || busy;

  // Engine connection badge
  const engineConnected = providerState === 'ready';
  const engineError = providerState === 'error' || providerState === 'unconfigured';
  const engineConnecting = providerState === 'connecting';
  const engineBadge = engineConnected
    ? { label: activeEngine === 'voice_agent_api' ? 'PATH 1 ✓' : 'PATH 2 ✓', variant: 'success' as const }
    : engineError
    ? { label: providerErrorCode === 'no_key' ? 'NO KEY' : providerErrorCode === 'auth_failed' ? 'AUTH ERR' : 'ERROR', variant: 'warning' as const }
    : engineConnecting
    ? { label: 'CONNECTING', variant: 'cyan' as const }
    : null;

  const isSpeaking = agentStatus === 'speaking';
  const isThinking = agentStatus === 'thinking';
  const isAwaiting = agentStatus === 'awaiting_confirmation';

  const statusLabel = isSpeaking
    ? 'Speaking'
    : isThinking
    ? 'Reasoning'
    : isAwaiting
    ? 'Awaiting Auth'
    : isConnected
    ? 'Standby'
    : 'Offline';

  const statusBadgeVariant = isSpeaking
    ? 'cyan'
    : isThinking || isAwaiting
    ? 'warning'
    : isConnected
    ? 'success'
    : 'secondary';

  const statusDotColor = isSpeaking
    ? 'bg-cyan-400 animate-ping'
    : isThinking || isAwaiting
    ? 'bg-amber-400 animate-pulse'
    : isConnected
    ? 'bg-emerald-400'
    : 'bg-zinc-500';

  return (
    <header className="app-header">
      <div className="header-inner">
        {/* Brand */}
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <a href="#workspace" className="brand flex items-center gap-2.5 group" aria-label="J.A.R.V.I.S. workspace">
            <span className="brand-symbol w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
              <AudioLines size={18} className="brand-audio-icon" />
            </span>
            <span className="brand-text font-bold text-sm text-slate-100 flex flex-col leading-tight">
              <span>J.A.R.V.I.S.<span className="text-cyan-400 font-normal"> SRE</span></span>
              <small className="brand-tagline text-[9px] font-mono tracking-widest text-zinc-500 uppercase font-normal">VOICE INCIDENT WORKSPACE</small>
            </span>
          </a>

          {/* AssemblyAI Official Badge */}
          <Badge variant="cyan" className="hidden lg:flex items-center gap-1.5 py-0.5 px-2 text-[10px] font-normal tracking-wide">
            <Radio size={11} className="text-cyan-400 animate-pulse" />
            <span>AssemblyAI Universal-3 Pro</span>
          </Badge>
        </div>

        {/* Top-Level Page Navigation */}
        <nav className="main-page-nav flex items-center gap-1 p-1 bg-zinc-900/90 border border-zinc-800 rounded-lg shadow-inner" aria-label="Page navigation">
          <Button
            type="button"
            variant={activePage === 'mission_control' || !activePage ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onNavigate?.('mission_control')}
            className={`h-7 px-2.5 text-xs font-semibold gap-1.5 ${
              activePage === 'mission_control' || !activePage
                ? 'bg-zinc-800 text-slate-100 shadow-sm border border-zinc-700/60'
                : 'text-zinc-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard size={13} className={activePage === 'mission_control' || !activePage ? 'text-cyan-400' : 'text-zinc-400'} />
            <span className="hidden sm:inline">Mission Control</span>
            <span className="sm:hidden">Mission</span>
          </Button>

          <Button
            type="button"
            variant={activePage === 'usage' ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onNavigate?.('usage')}
            className={`h-7 px-2.5 text-xs font-semibold gap-1.5 ${
              activePage === 'usage'
                ? 'bg-zinc-800 text-slate-100 shadow-sm border border-zinc-700/60'
                : 'text-zinc-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 size={13} className={activePage === 'usage' ? 'text-cyan-400' : 'text-zinc-400'} />
            <span className="hidden sm:inline">Usage & Analytics</span>
            <span className="sm:hidden">Usage</span>
          </Button>

          <Button
            type="button"
            variant={activePage === 'settings' ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onNavigate?.('settings')}
            className={`h-7 px-2.5 text-xs font-semibold gap-1.5 ${
              activePage === 'settings'
                ? 'bg-zinc-800 text-slate-100 shadow-sm border border-zinc-700/60'
                : 'text-zinc-400 hover:text-slate-200'
            }`}
          >
            <Sliders size={13} className={activePage === 'settings' ? 'text-cyan-400' : 'text-zinc-400'} />
            <span className="hidden sm:inline">System Settings</span>
            <span className="sm:hidden">Config</span>
          </Button>
        </nav>

        {/* Center: Dual-Engine Switcher HUD */}
        <div className="hidden xl:flex items-center gap-1 p-1 bg-zinc-900/80 border border-zinc-800 rounded-lg shadow-inner">
          <Button
            type="button"
            variant={activeEngine === 'voice_agent_api' ? "secondary" : "ghost"}
            size="sm"
            disabled={disabled}
            onClick={() => onSelectEngine('voice_agent_api')}
            className={`h-7 px-2.5 text-xs font-semibold gap-1.5 ${
              activeEngine === 'voice_agent_api'
                ? 'bg-zinc-800 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-zinc-400 hover:text-slate-200'
            }`}
            title="AssemblyAI End-to-End Voice Agent API"
          >
            <Zap size={13} className={activeEngine === 'voice_agent_api' ? 'text-amber-400' : 'text-zinc-400'} />
            <span>Path 1: Voice Agent API</span>
          </Button>

          <Button
            type="button"
            variant={activeEngine === 'custom_stt_v3' ? "secondary" : "ghost"}
            size="sm"
            disabled={disabled}
            onClick={() => onSelectEngine('custom_stt_v3')}
            className={`h-7 px-2.5 text-xs font-semibold gap-1.5 ${
              activeEngine === 'custom_stt_v3'
                ? 'bg-zinc-800 text-cyan-300 border border-cyan-500/30 shadow-sm'
                : 'text-zinc-400 hover:text-slate-200'
            }`}
            title="AssemblyAI Streaming v3 STT + Custom Tool Orchestrator + LLM Gateway"
          >
            <Cpu size={13} className={activeEngine === 'custom_stt_v3' ? 'text-cyan-400' : 'text-zinc-400'} />
            <span>Path 2: Streaming v3 + LLM Gateway</span>
          </Button>

          {/* Engine connection badge */}
          {engineBadge && (
            <Badge variant={engineBadge.variant} className="ml-1 text-[10px] tracking-wide">
              {engineBadge.label}
            </Badge>
          )}
        </div>

        {/* Right Header Actions & Live Telemetry Pills */}
        <div className="header-actions flex items-center gap-2">
          {/* Live Agent Status Beacon */}
          <Badge variant={statusBadgeVariant as any} className="flex items-center gap-2 px-2.5 py-1 text-[11px] font-mono tracking-tight font-semibold uppercase">
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${statusDotColor}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isSpeaking ? 'bg-cyan-500' : isConnected ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
            </span>
            <span>{statusLabel}</span>
          </Badge>

          {/* Real-time Latency counter */}
          <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-900/90 border border-zinc-800 text-[11px] font-mono text-zinc-300">
            <span className="text-zinc-500">STT:</span>
            <span className={latency.stt_ms ? 'text-cyan-400 font-semibold' : 'text-zinc-500'}>
              {latency.stt_ms != null ? `${latency.stt_ms.toFixed(0)}ms` : '—'}
            </span>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-500">Total:</span>
            <span className={latency.total_ms ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
              {latency.total_ms != null ? `${latency.total_ms.toFixed(0)}ms` : '—'}
            </span>
          </div>

          {/* Autopilot quick toggle */}
          {onToggleAutopilot && (
            <Button
              type="button"
              variant={autopilotEnabled ? "outline" : "ghost"}
              size="sm"
              onClick={onToggleAutopilot}
              disabled={disabled}
              className={`hidden sm:flex items-center gap-1.5 h-7 px-2.5 text-xs font-mono font-medium border ${
                autopilotEnabled
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'border-zinc-800 text-zinc-400 hover:text-slate-200'
              }`}
              title="Toggle Autopilot (Automatic Remediation Execution)"
            >
              <Activity size={12} className={autopilotEnabled ? 'text-amber-400 animate-spin' : 'text-zinc-500'} />
              <span>{autopilotEnabled ? 'AUTOPILOT ON' : 'MANUAL CONFIRM'}</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

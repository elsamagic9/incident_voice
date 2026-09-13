import React from 'react';
import {
  Zap, Sliders,
  Activity, Radio, Cpu, BarChart3, LayoutDashboard, Terminal
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

  const engineConnected = providerState === 'ready';
  const engineError = providerState === 'error' || providerState === 'unconfigured';
  const engineConnecting = providerState === 'connecting';
  const engineBadge = engineConnected
    ? { label: activeEngine === 'voice_agent_api' ? 'PATH 1' : 'PATH 2', variant: 'success' as const }
    : engineError
    ? { label: providerErrorCode === 'no_key' ? 'NO KEY' : providerErrorCode === 'auth_failed' ? 'AUTH ERR' : 'ERROR', variant: 'warning' as const }
    : engineConnecting
    ? { label: 'CONNECTING', variant: 'secondary' as const }
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

  const statusDotColor = isSpeaking
    ? 'bg-primary animate-pulse'
    : isThinking || isAwaiting
    ? 'bg-amber-400 animate-pulse'
    : isConnected
    ? 'bg-emerald-500'
    : 'bg-muted-foreground';

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        {/* Brand & AssemblyAI Badge */}
        <div className="flex items-center gap-3 md:gap-4 shrink-0">
          <a href="#workspace" className="flex items-center gap-2.5 group" aria-label="IncidentVoice Workspace">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shadow-sm">
              <Terminal size={16} />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-foreground flex items-center gap-1">
                IncidentVoice <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono font-normal">SRE</Badge>
              </span>
              <span className="text-[9px] font-mono tracking-wider text-muted-foreground uppercase">
                AssemblyAI Voice Agent
              </span>
            </div>
          </a>

          <Badge variant="outline" className="hidden lg:inline-flex items-center gap-1.5 py-0.5 px-2 text-[10px] font-normal text-muted-foreground">
            <Radio size={11} className="text-emerald-500 animate-pulse" />
            <span>Universal-3 Pro</span>
          </Badge>
        </div>

        {/* Top-Level Page Navigation */}
        <nav className="hidden md:flex items-center gap-1 p-1 bg-muted rounded-lg" aria-label="Page navigation">
          <Button
            type="button"
            variant={activePage === 'mission_control' || !activePage ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onNavigate?.('mission_control')}
            className={`h-7 px-3 text-xs font-medium gap-1.5 ${
              activePage === 'mission_control' || !activePage
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutDashboard size={13} />
            <span className="hidden sm:inline">Mission Control</span>
            <span className="sm:hidden">Mission</span>
          </Button>

          <Button
            type="button"
            variant={activePage === 'usage' ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onNavigate?.('usage')}
            className={`h-7 px-3 text-xs font-medium gap-1.5 ${
              activePage === 'usage'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart3 size={13} />
            <span className="hidden sm:inline">Usage & Analytics</span>
            <span className="sm:hidden">Usage</span>
          </Button>

          <Button
            type="button"
            variant={activePage === 'settings' ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onNavigate?.('settings')}
            className={`h-7 px-3 text-xs font-medium gap-1.5 ${
              activePage === 'settings'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sliders size={13} />
            <span className="hidden sm:inline">System Settings</span>
            <span className="sm:hidden">Settings</span>
          </Button>
        </nav>

        {/* Dual-Engine Switcher Toggle */}
        <div className="hidden xl:flex items-center gap-1 p-0.5 bg-muted rounded-lg border border-border/40">
          <Button
            type="button"
            variant={activeEngine === 'voice_agent_api' ? "secondary" : "ghost"}
            size="sm"
            disabled={disabled}
            onClick={() => onSelectEngine('voice_agent_api')}
            className={`h-7 px-2.5 text-xs font-medium gap-1.5 whitespace-nowrap ${
              activeEngine === 'voice_agent_api'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="AssemblyAI End-to-End Voice Agent API"
          >
            <Zap size={13} className={activeEngine === 'voice_agent_api' ? 'text-amber-400' : 'text-muted-foreground'} />
            <span className="whitespace-nowrap">Path 1: Voice Agent API</span>
          </Button>

          <Button
            type="button"
            variant={activeEngine === 'custom_stt_v3' ? "secondary" : "ghost"}
            size="sm"
            disabled={disabled}
            onClick={() => onSelectEngine('custom_stt_v3')}
            className={`h-7 px-2.5 text-xs font-medium gap-1.5 whitespace-nowrap ${
              activeEngine === 'custom_stt_v3'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="AssemblyAI Streaming v3 STT + Custom Tool Orchestrator + LLM Gateway"
          >
            <Cpu size={13} className={activeEngine === 'custom_stt_v3' ? 'text-primary' : 'text-muted-foreground'} />
            <span className="whitespace-nowrap">Path 2: Streaming v3 STT</span>
          </Button>

          {engineBadge && (
            <Badge variant={engineBadge.variant} className="ml-1 text-[10px]">
              {engineBadge.label}
            </Badge>
          )}
        </div>

        {/* Right Status Badges & Telemetry */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Badge variant="outline" className="flex items-center gap-2 px-2.5 py-1 text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${statusDotColor}`} />
            <span>{statusLabel}</span>
          </Badge>

          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-md border border-border bg-muted/40 text-[11px] font-mono text-muted-foreground">
            <span>STT:</span>
            <span className={latency.stt_ms ? 'text-foreground font-semibold' : 'text-muted-foreground'}>
              {latency.stt_ms != null ? `${latency.stt_ms.toFixed(0)}ms` : '—'}
            </span>
            <span className="text-border">|</span>
            <span>Total:</span>
            <span className={latency.total_ms ? 'text-emerald-400 font-semibold' : 'text-muted-foreground'}>
              {latency.total_ms != null ? `${latency.total_ms.toFixed(0)}ms` : '—'}
            </span>
          </div>

          {onToggleAutopilot && (
            <Button
              type="button"
              variant={autopilotEnabled ? "default" : "outline"}
              size="sm"
              onClick={onToggleAutopilot}
              disabled={disabled}
              className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-mono"
              title="Toggle Autopilot (Automatic Remediation Execution)"
            >
              <Activity size={12} className={autopilotEnabled ? 'animate-spin' : ''} />
              <span>{autopilotEnabled ? 'AUTOPILOT ON' : 'MANUAL CONFIRM'}</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

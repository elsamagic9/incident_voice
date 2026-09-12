import React, { useState } from 'react';
import {
  AudioLines, ChevronDown, Settings2, RefreshCw, Zap, Sliders,
  ShieldCheck, Activity, Radio, Cpu, BarChart3, LayoutDashboard
} from 'lucide-react';
import { AgentStatus, IncidentRecord, VoiceEngine } from '../types';
import { LatencyStats } from '../hooks/useVoiceStream';

export type ActivePage = 'mission_control' | 'usage' | 'settings';

interface Props {
  incident: IncidentRecord | null;
  agentStatus: AgentStatus;
  isConnected: boolean;
  latency: LatencyStats;
  activeEngine: VoiceEngine;
  infrastructureMode?: string;
  rbacRole?: string;
  busy?: boolean;
  autopilotEnabled?: boolean;
  onToggleAutopilot?: () => void;
  onSelectEngine: (engine: VoiceEngine) => void;
  onReset: () => void;
  activePage?: ActivePage;
  onNavigate?: (page: ActivePage) => void;
}

export const MissionControlHeader: React.FC<Props> = ({
  isConnected,
  latency,
  activeEngine,
  infrastructureMode,
  rbacRole,
  busy,
  autopilotEnabled,
  onToggleAutopilot,
  onSelectEngine,
  onReset,
  agentStatus,
  activePage = 'mission_control',
  onNavigate,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const disabled = !isConnected || busy;

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

  const statusColorClass = isSpeaking
    ? 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
    : isThinking || isAwaiting
    ? 'text-amber-400 border-amber-500/40 bg-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
    : isConnected
    ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
    : 'text-slate-400 border-slate-700 bg-slate-800/50';

  const statusDotColor = isSpeaking
    ? 'bg-cyan-400 animate-ping'
    : isThinking || isAwaiting
    ? 'bg-amber-400 animate-pulse'
    : isConnected
    ? 'bg-emerald-400'
    : 'bg-slate-500';

  return (
    <header className="app-header">
      <div className="header-inner">
        {/* Brand */}
        <div className="flex items-center gap-3 md:gap-5 min-w-0">
          <a href="#workspace" className="brand" aria-label="J.A.R.V.I.S. workspace">
            <span className="brand-symbol">
              <AudioLines size={22} className="brand-audio-icon" />
            </span>
            <span className="brand-text">
              J.A.R.V.I.S.<span className="brand-light"> SRE</span>
              <small className="brand-tagline">VOICE INCIDENT WORKSPACE</small>
            </span>
          </a>

          {/* AssemblyAI Official Badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium tracking-wide bg-gradient-to-r from-blue-950/60 to-cyan-950/60 border border-cyan-500/30 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
            <Radio size={11} className="text-cyan-400 animate-pulse" />
            <span>AssemblyAI Universal-3 Pro</span>
          </div>
        </div>

        {/* Top-Level Page Navigation */}
        <nav className="main-page-nav items-center gap-1 p-1 bg-slate-900/90 border border-slate-800 rounded-xl shadow-inner backdrop-blur-md" aria-label="Page navigation">
          <button
            type="button"
            onClick={() => onNavigate?.('mission_control')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              activePage === 'mission_control' || !activePage
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-[0_0_12px_rgba(6,182,212,0.35)] border border-cyan-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard size={13} className={activePage === 'mission_control' || !activePage ? 'text-cyan-300' : 'text-slate-400'} />
            <span className="hidden sm:inline">Mission Control</span>
            <span className="sm:hidden">Mission</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('usage')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              activePage === 'usage'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-[0_0_12px_rgba(6,182,212,0.35)] border border-cyan-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <BarChart3 size={13} className={activePage === 'usage' ? 'text-cyan-300' : 'text-slate-400'} />
            <span className="hidden sm:inline">Usage & Analytics</span>
            <span className="sm:hidden">Usage</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('settings')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              activePage === 'settings'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-[0_0_12px_rgba(6,182,212,0.35)] border border-cyan-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sliders size={13} className={activePage === 'settings' ? 'text-cyan-300' : 'text-slate-400'} />
            <span className="hidden sm:inline">System Settings</span>
            <span className="sm:hidden">Config</span>
          </button>
        </nav>

        {/* Center: Dual-Engine Switcher HUD */}
        <div className="hidden xl:flex items-center gap-1 p-1 bg-slate-900/80 border border-slate-800/90 rounded-xl shadow-inner backdrop-blur-md">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelectEngine('voice_agent_api')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              activeEngine === 'voice_agent_api'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)] border border-cyan-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="AssemblyAI End-to-End Voice Agent API"
          >
            <Zap size={13} className={activeEngine === 'voice_agent_api' ? 'text-amber-300' : 'text-slate-400'} />
            <span>Path 1: Voice Agent API</span>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelectEngine('custom_stt_v3')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              activeEngine === 'custom_stt_v3'
                ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] border border-indigo-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="AssemblyAI Streaming v3 STT + Custom Tool Orchestrator + LLM Gateway"
          >
            <Cpu size={13} className={activeEngine === 'custom_stt_v3' ? 'text-cyan-300' : 'text-slate-400'} />
            <span>Path 2: Streaming v3 + LLM Gateway</span>
          </button>
        </div>

        {/* Right Header Actions & Live Telemetry Pills */}
        <div className="header-actions">
          {/* Live Agent Status Beacon */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${statusColorClass} backdrop-blur-md`}>
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${statusDotColor}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isSpeaking ? 'bg-cyan-500' : isConnected ? 'bg-emerald-500' : 'bg-slate-500'}`} />
            </span>
            <span className="font-mono tracking-tight font-semibold uppercase text-[11px]">{statusLabel}</span>
          </div>

          {/* Real-time Latency counter */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900/70 border border-slate-800 text-[11px] font-mono text-slate-300">
            <span className="text-slate-500">STT:</span>
            <span className={latency.stt_ms ? 'text-cyan-400 font-semibold' : 'text-slate-500'}>
              {latency.stt_ms != null ? `${latency.stt_ms.toFixed(0)}ms` : '—'}
            </span>
            <span className="text-slate-700">|</span>
            <span className="text-slate-500">Total:</span>
            <span className={latency.total_ms ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
              {latency.total_ms != null ? `${latency.total_ms.toFixed(0)}ms` : '—'}
            </span>
          </div>

          {/* Autopilot quick toggle */}
          {onToggleAutopilot && (
            <button
              type="button"
              onClick={onToggleAutopilot}
              disabled={disabled}
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all duration-200 ${
                autopilotEnabled
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
              title="Toggle Autopilot (Automatic Remediation Execution)"
            >
              <Activity size={12} className={autopilotEnabled ? 'text-amber-400 animate-spin' : 'text-slate-500'} />
              <span>{autopilotEnabled ? 'AUTOPILOT ON' : 'MANUAL CONFIRM'}</span>
            </button>
          )}

          {/* Settings / Deep Config Dropdown Toggle */}
          <button
            className={`button button-quiet ${settingsOpen ? 'is-active' : ''}`}
            aria-expanded={settingsOpen}
            aria-label="Settings"
            aria-controls="workspace-settings"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Settings2 size={16} />
            <span className="hidden sm:inline">Settings</span>
            <ChevronDown size={14} className={`transition-transform duration-200 ${settingsOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expanded Settings & Diagnostics Panel */}
      {settingsOpen && (
        <section id="workspace-settings" className="settings-panel" aria-label="Workspace settings">
          <div>
            <label htmlFor="voice-engine" className="field-label flex items-center gap-2">
              <Sliders size={14} className="text-cyan-400" />
              Voice Orchestration Engine
            </label>
            <select
              id="voice-engine"
              disabled={disabled}
              value={activeEngine}
              onChange={event => onSelectEngine(event.target.value as VoiceEngine)}
              className="mt-2 w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            >
              <option value="voice_agent_api">Path 1 · AssemblyAI Voice Agent API (Managed WebRTC/WS)</option>
              <option value="custom_stt_v3">Path 2 · Streaming v3 STT + Custom Tool Calling + LLM Gateway</option>
            </select>
            <p className="field-help mt-2">
              Switching engines cleanly migrates session state and re-initializes audio streaming without losing incident context.
            </p>
          </div>

          <div>
            <p className="field-label flex items-center gap-2">
              <ShieldCheck size={14} className="text-emerald-400" />
              SRE Security & Autopilot
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 font-mono text-xs text-cyan-300">
                {rbacRole ? rbacRole.toUpperCase() : 'ANONYMOUS'}
              </span>
              <span className="text-xs text-slate-400">
                {infrastructureMode === 'docker' ? 'Docker Host Bridge' : infrastructureMode === 'kubernetes' ? 'K8s Multi-Cluster' : 'Demo Simulator'}
              </span>
            </div>
            {onToggleAutopilot && (
              <label className="switch-label mt-3 flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!autopilotEnabled}
                  disabled={disabled}
                  onChange={onToggleAutopilot}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500"
                />
                Auto-approve safe diagnostic and remediation actions
              </label>
            )}
            <div className="mt-3 pt-2 border-t border-slate-800">
              <button className="text-button text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5" onClick={onReset} disabled={disabled}>
                <RefreshCw size={13} />
                Emergency Incident Reset
              </button>
            </div>
          </div>

          <div>
            <p className="field-label flex items-center gap-2">
              <Activity size={14} className="text-cyan-400" />
              Sub-Second Acoustic Latency Profile
            </p>
            <dl className="latency-grid mt-2">
              {([
                ['Speech Recognition (STT)', latency.stt_ms],
                ['LLM Reasoning & Tools', latency.tool_ms],
                ['TTS Synthesis', latency.tts_ms],
                ['Round-Trip End-to-End', latency.total_ms]
              ] as const).map(([label, value]) => (
                <div key={label} className="flex justify-between py-1 border-b border-slate-800/60 text-xs">
                  <dt className="text-slate-400">{label}</dt>
                  <dd className="font-mono text-cyan-300 font-medium">
                    {value == null ? '—' : `${value.toFixed(0)} ms`}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="field-help mt-2">AssemblyAI Universal-3 Pro yields sub-300ms transcription turn-around.</p>
          </div>

          <div className="col-span-full pt-3 mt-1 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-400">Deep tuning, API credentials, and incident forensics:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="button button-secondary text-xs flex items-center gap-1.5"
                onClick={() => { setSettingsOpen(false); onNavigate?.('usage'); }}
              >
                <BarChart3 size={13} className="text-cyan-400" />
                <span>Open Usage Graph</span>
              </button>
              <button
                type="button"
                className="button button-primary text-xs flex items-center gap-1.5"
                onClick={() => { setSettingsOpen(false); onNavigate?.('settings'); }}
              >
                <Sliders size={13} />
                <span>Open System Settings</span>
              </button>
            </div>
          </div>
        </section>
      )}
    </header>
  );
};

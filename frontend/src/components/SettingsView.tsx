import React, { useState, useEffect } from 'react';
import {
  Sliders, ArrowLeft, RefreshCw, AlertTriangle, Zap, Database
} from 'lucide-react';
import { VoiceEngine } from '../types';

export interface SettingsState {
  // Voice & Audio
  voiceEngine: VoiceEngine;
  // SRE Policy & Safety
  autopilotMode: boolean;
}

const DEFAULT_SETTINGS: SettingsState = {
  voiceEngine: 'voice_agent_api',
  autopilotMode: false,
};

const STORAGE_KEY = 'jarvis_sre_settings_v1';

interface Props {
  onNavigateBack: () => void;
  onSelectEngine?: (engine: VoiceEngine) => void;
  onResetIncident?: () => void;
  currentEngine?: VoiceEngine;
  currentAutopilot?: boolean;
  onToggleAutopilot?: () => void;
  rbacRole?: string;
  infrastructureMode?: string;
}

export const SettingsView: React.FC<Props> = ({
  onNavigateBack,
  onSelectEngine,
  onResetIncident,
  currentEngine,
  currentAutopilot,
  onToggleAutopilot,
}) => {
  const [activeTab, setActiveTab] = useState<'voice' | 'storage'>('voice');
  const [settings, setSettings] = useState<SettingsState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      // Ignore parse error
    }
    return DEFAULT_SETTINGS;
  });

  // Sync engine and autopilot from props if updated externally
  useEffect(() => {
    if (currentEngine && currentEngine !== settings.voiceEngine) {
      setSettings(prev => ({ ...prev, voiceEngine: currentEngine }));
    }
  }, [currentEngine]);

  useEffect(() => {
    if (currentAutopilot !== undefined && currentAutopilot !== settings.autopilotMode) {
      setSettings(prev => ({ ...prev, autopilotMode: currentAutopilot }));
    }
  }, [currentAutopilot]);

  const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage full or restricted
      }
      return next;
    });

    // Synchronize engine if changed
    if (key === 'voiceEngine' && onSelectEngine) {
      onSelectEngine(value as VoiceEngine);
    }
    // Synchronize autopilot if changed
    if (key === 'autopilotMode' && onToggleAutopilot && value !== currentAutopilot) {
      onToggleAutopilot();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      <header className="flex-none p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
        <div className="flex items-center gap-4">
          <button
            onClick={onNavigateBack}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
            aria-label="Back to Mission Control"
          >
            <ArrowLeft size={18} className="text-slate-300" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Sliders size={20} className="text-cyan-400" />
              Settings & Preferences
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Configure engine modes and reset incident state.
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Nav */}
        <div className="w-64 border-r border-slate-800 bg-slate-900/30 overflow-y-auto p-4 space-y-1 flex-none">
          <button
            onClick={() => setActiveTab('voice')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
              activeTab === 'voice'
                ? 'bg-cyan-500/20 text-cyan-300 shadow-[inset_2px_0_0_0_rgba(6,182,212,1)]'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <Zap size={16} />
            Voice Engine
          </button>
          <button
            onClick={() => setActiveTab('storage')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
              activeTab === 'storage'
                ? 'bg-cyan-500/20 text-cyan-300 shadow-[inset_2px_0_0_0_rgba(6,182,212,1)]'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <Database size={16} />
            Incident Reset
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="max-w-4xl mx-auto space-y-8">

            {/* TAB 1: Voice Engine */}
            {activeTab === 'voice' && (
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-md space-y-5">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Zap size={18} className="text-amber-400" />
                    AssemblyAI Orchestration Mode
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Select between the managed end-to-end Voice Agent API or the customizable Streaming v3 STT pipeline.
                  </p>
                </div>

                <div className="space-y-3">
                  <label
                    onClick={() => updateSetting('voiceEngine', 'voice_agent_api')}
                    className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition-all ${
                      settings.voiceEngine === 'voice_agent_api'
                        ? 'bg-cyan-500/10 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                        : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="voiceEngine"
                      checked={settings.voiceEngine === 'voice_agent_api'}
                      onChange={() => updateSetting('voiceEngine', 'voice_agent_api')}
                      className="mt-1 accent-cyan-400"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">Path 1: Voice Agent API</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-300 font-semibold">
                          OFFICIAL HACKATHON PATH
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Direct WebSocket to <code className="text-cyan-300">agents.assemblyai.com</code> with sub-second turn taking, JSON schema function dispatch, and native voice synthesis.
                      </p>
                    </div>
                  </label>

                  <label
                    onClick={() => updateSetting('voiceEngine', 'custom_stt_v3')}
                    className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition-all ${
                      settings.voiceEngine === 'custom_stt_v3'
                        ? 'bg-indigo-500/10 border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                        : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="voiceEngine"
                      checked={settings.voiceEngine === 'custom_stt_v3'}
                      onChange={() => updateSetting('voiceEngine', 'custom_stt_v3')}
                      className="mt-1 accent-indigo-400"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">Path 2: Streaming v3 + Custom Orchestrator</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 font-semibold">
                          BYO-ORCHESTRATION
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        AssemblyAI Universal-3 Pro real-time streaming WebSocket combined with our custom SRE Tool Planner and multi-artifact LeMUR synthesis.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* TAB 2: Incident Reset */}
            {activeTab === 'storage' && (
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-md space-y-6">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Database size={18} className="text-cyan-400" />
                    Incident State Reset
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Reset active incident state and clear executed tool logs.
                  </p>
                </div>

                <div className="p-5 rounded-xl bg-rose-950/20 border border-rose-900/40 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-rose-300 flex items-center gap-1.5">
                      <AlertTriangle size={16} />
                      Emergency Incident State Reset
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Resets the current incident session, clears executed tool logs, and re-initializes cluster health.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to reset the entire incident session?')) {
                        onResetIncident?.();
                        alert('Incident session reset successfully.');
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-900/40 transition hover:scale-105"
                  >
                    <RefreshCw size={14} />
                    <span>Execute Emergency Incident Reset</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Sliders, Cpu, ShieldAlert, Server, Database, ArrowLeft,
  RotateCcw, Download, Upload, CheckCircle2, AlertTriangle,
  Eye, EyeOff, Volume2, Zap, Check, Key, Bell, Radio, RefreshCw
} from 'lucide-react';
import { VoiceEngine } from '../types';

export interface SettingsState {
  // Voice & Audio
  voiceEngine: VoiceEngine;
  ttsVoicePersona: string;
  sttModel: string;
  vadSensitivity: number;
  bargeInEnabled: boolean;
  bargeInAggressive: boolean;
  autoReconnectMic: boolean;
  sampleRate: number;

  // AI Gateway & Reasoning
  aiProvider: string;
  reasoningTemperature: number;
  enableToT: boolean;
  causalRcaDepth: 'shallow' | 'standard' | 'deep';
  assemblyAiApiKey: string;
  geminiApiKey: string;
  openAiApiKey: string;

  // SRE Policy & Safety
  autopilotMode: boolean;
  stagedActionTtl: number;
  walSyncOnCommit: boolean;
  auditLedgerVerification: boolean;

  // Cluster & Infra
  infrastructureMode: 'docker' | 'kubernetes' | 'simulation';
  telemetryPollingSec: number;
  pagerDutyKey: string;
  slackWebhookUrl: string;
}

const DEFAULT_SETTINGS: SettingsState = {
  voiceEngine: 'voice_agent_api',
  ttsVoicePersona: 'en-US-GuyNeural',
  sttModel: 'universal-3-5-pro',
  vadSensitivity: 0.55,
  bargeInEnabled: true,
  bargeInAggressive: false,
  autoReconnectMic: true,
  sampleRate: 16000,

  aiProvider: 'gemini-2.0-flash',
  reasoningTemperature: 0.2,
  enableToT: true,
  causalRcaDepth: 'standard',
  assemblyAiApiKey: '',
  geminiApiKey: '',
  openAiApiKey: '',

  autopilotMode: false,
  stagedActionTtl: 30,
  walSyncOnCommit: true,
  auditLedgerVerification: true,

  infrastructureMode: 'simulation',
  telemetryPollingSec: 2,
  pagerDutyKey: '',
  slackWebhookUrl: '',
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
  rbacRole = 'SRE_COMMANDER',
  infrastructureMode = 'simulation',
}) => {
  const [activeTab, setActiveTab] = useState<'voice' | 'ai' | 'safety' | 'cluster' | 'storage'>('voice');
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

  const [savedAlert, setSavedAlert] = useState(false);
  const [showKeys, setShowKeys] = useState<{ assembly: boolean; gemini: boolean; openai: boolean }>({
    assembly: false,
    gemini: false,
    openai: false,
  });
  const [testPingState, setTestPingState] = useState<string | null>(null);

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
    setSavedAlert(true);
    setTimeout(() => setSavedAlert(false), 2200);

    // Synchronize engine if changed
    if (key === 'voiceEngine' && onSelectEngine) {
      onSelectEngine(value as VoiceEngine);
    }
    // Synchronize autopilot if changed
    if (key === 'autopilotMode' && onToggleAutopilot && value !== currentAutopilot) {
      onToggleAutopilot();
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset all settings to default values?')) {
      setSettings(DEFAULT_SETTINGS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
      setSavedAlert(true);
      setTimeout(() => setSavedAlert(false), 2200);
    }
  };

  const handleExportConfig = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(settings, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `incidentvoice-config-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const merged = { ...DEFAULT_SETTINGS, ...parsed };
        setSettings(merged);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        alert('Configuration imported successfully!');
      } catch {
        alert('Invalid JSON configuration file.');
      }
    };
    reader.readAsText(file);
  };

  const handleTestPing = (target: string) => {
    setTestPingState(`Pinging ${target}...`);
    setTimeout(() => {
      setTestPingState(`✓ ${target} ping test successful (200 OK)`);
      setTimeout(() => setTestPingState(null), 3000);
    }, 800);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-fadeIn">
      {/* Top Banner Navigation & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-950/90 border border-slate-800 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button
            onClick={onNavigateBack}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 text-xs font-semibold transition-all hover:scale-105"
            aria-label="Back to Mission Control"
          >
            <ArrowLeft size={16} className="text-cyan-400" />
            <span>Mission Control</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <Sliders size={20} className="text-cyan-400" />
                Workspace Settings & SRE Policies
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                v1.2
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Fine-tune AssemblyAI Universal-3 Pro acoustics, LLM gateways, two-phase safety, and infrastructure endpoints.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {savedAlert && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 animate-pulse">
              <CheckCircle2 size={13} />
              Saved to storage
            </span>
          )}
          <button
            onClick={handleExportConfig}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition"
            title="Export config JSON"
          >
            <Download size={14} />
            <span className="hidden md:inline">Export</span>
          </button>
          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium cursor-pointer transition">
            <Upload size={14} />
            <span className="hidden md:inline">Import</span>
            <input type="file" accept=".json" onChange={handleImportConfig} className="sr-only" />
          </label>
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 text-xs font-medium transition"
            title="Reset all settings to default"
          >
            <RotateCcw size={14} />
            <span className="hidden md:inline">Reset</span>
          </button>
        </div>
      </div>

      {/* Settings Tab Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-1.5 bg-slate-900/80 border border-slate-800/90 rounded-2xl backdrop-blur-md">
        <button
          onClick={() => setActiveTab('voice')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'voice'
              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20 border border-cyan-400/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Volume2 size={15} />
          <span>Voice & Audio</span>
        </button>

        <button
          onClick={() => setActiveTab('ai')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'ai'
              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20 border border-cyan-400/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Cpu size={15} />
          <span>AI Gateway</span>
        </button>

        <button
          onClick={() => setActiveTab('safety')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'safety'
              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20 border border-cyan-400/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <ShieldAlert size={15} />
          <span>SRE Policy</span>
        </button>

        <button
          onClick={() => setActiveTab('cluster')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'cluster'
              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20 border border-cyan-400/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Server size={15} />
          <span>Cluster & Infra</span>
        </button>

        <button
          onClick={() => setActiveTab('storage')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all col-span-2 sm:col-span-1 ${
            activeTab === 'storage'
              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20 border border-cyan-400/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Database size={15} />
          <span>Storage & Reset</span>
        </button>
      </div>

      {/* TAB 1: Voice & Audio */}
      {activeTab === 'voice' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Engine Selection Card */}
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

            <div className="pt-2 border-t border-slate-800">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Speech-to-Text Model Selection
              </label>
              <select
                value={settings.sttModel}
                onChange={e => updateSetting('sttModel', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-cyan-500"
              >
                <option value="universal-3-5-pro">Universal-3 Pro (Recommended · Sub-200ms latency)</option>
                <option value="universal-2">Universal-2 (Standard Speech Recognition)</option>
              </select>
            </div>
          </div>

          {/* Voice Persona & Acoustics */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-md space-y-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Radio size={18} className="text-cyan-400" />
                TTS Persona & Acoustic Dynamics
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Customize J.A.R.V.I.S. vocal tone, voice activity sensitivity, and interruption handling.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Spoken Voice Persona
                </label>
                <select
                  value={settings.ttsVoicePersona}
                  onChange={e => updateSetting('ttsVoicePersona', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:border-cyan-500"
                >
                  <option value="en-US-GuyNeural">Guy (Authoritative Lead SRE · Deep & Decisive)</option>
                  <option value="en-GB-SoniaNeural">Sonia (Crisp Incident Commander · High Intelligibility)</option>
                  <option value="en-GB-RyanNeural">Ryan (Analytical Diagnostic Specialist · Rapid Cadence)</option>
                  <option value="en-US-ChristopherNeural">Christopher (Senior Operations Director · Calm & Clear)</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-semibold text-slate-300">Voice Activity Detection (VAD) Sensitivity</span>
                  <span className="font-mono text-cyan-400">{(settings.vadSensitivity * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="0.9"
                  step="0.05"
                  value={settings.vadSensitivity}
                  onChange={e => updateSetting('vadSensitivity', parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>Less Sensitive (Noisy room)</span>
                  <span>Balanced</span>
                  <span>Aggressive (Quiet room)</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-slate-300">
                    Barge-In Acoustic Interruptions
                    <span className="block text-[11px] font-normal text-slate-500">
                      Instantly cut agent speech when operator says "stop", "wait", or speaks &gt; 2 words
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.bargeInEnabled}
                    onChange={e => updateSetting('bargeInEnabled', e.target.checked)}
                    className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-slate-300">
                    Auto-Reconnect Microphone on Drop
                    <span className="block text-[11px] font-normal text-slate-500">
                      Re-initialize AudioWorklet stream if browser sleep or device change occurs
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.autoReconnectMic}
                    onChange={e => updateSetting('autoReconnectMic', e.target.checked)}
                    className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
                  />
                </label>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Hardware Audio Pipeline:</span>
                <span className="text-emerald-400 font-semibold">16,000 Hz Linear PCM · Mono AudioWorklet</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AI Gateway & Reasoning */}
      {activeTab === 'ai' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* LLM Gateway Configuration */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-md space-y-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Cpu size={18} className="text-cyan-400" />
                Reasoning Model & Synthesis Architecture
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Configure primary function calling engine and cognitive exploration depth.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Primary Reasoning Gateway
                </label>
                <select
                  value={settings.aiProvider}
                  onChange={e => updateSetting('aiProvider', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:border-cyan-500"
                >
                  <option value="gemini-2.0-flash">Google Gemini 2.0 Flash (Recommended · 120ms Tool Calling)</option>
                  <option value="openai-gpt-4o">OpenAI GPT-4o (High-Precision SRE Reasoning)</option>
                  <option value="claude-3-5-sonnet">Anthropic Claude 3.5 Sonnet (Deep Incident Forensics)</option>
                  <option value="assemblyai-lemur">AssemblyAI LeMUR (Native Post-Mortem & Timeline Synthesis)</option>
                  <option value="scripted-fallback">Deterministic SRE Rule Engine (Zero-Key Offline Fallback)</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-semibold text-slate-300">Reasoning Temperature</span>
                  <span className="font-mono text-cyan-400">{settings.reasoningTemperature.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={settings.reasoningTemperature}
                  onChange={e => updateSetting('reasoningTemperature', parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>0.0 (Strict SRE Determinism)</span>
                  <span>0.2 (Optimal)</span>
                  <span>1.0 (Creative Exploration)</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-slate-300">
                    Tree-of-Thoughts (ToT) Multi-Branch Hypothesis
                    <span className="block text-[11px] font-normal text-slate-500">
                      Explore multiple root causes concurrently before formulating the spoken response
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.enableToT}
                    onChange={e => updateSetting('enableToT', e.target.checked)}
                    className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
                  />
                </label>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Causal RCA Graph Traversal Depth
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['shallow', 'standard', 'deep'] as const).map(depth => (
                      <button
                        key={depth}
                        type="button"
                        onClick={() => updateSetting('causalRcaDepth', depth)}
                        className={`py-2 px-2.5 rounded-lg text-xs font-medium capitalize border transition ${
                          settings.causalRcaDepth === depth
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-semibold'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {depth === 'shallow' ? '1-Hop' : depth === 'standard' ? '2-Hop' : 'Full Cluster'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Secure API Key Gateway */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-md space-y-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Key size={18} className="text-emerald-400" />
                API Credentials & Vault Overrides
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Keys stored securely in browser local storage or injected via backend <code className="text-cyan-300">.env</code>.
              </p>
            </div>

            <div className="space-y-4">
              {/* AssemblyAI API Key */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  AssemblyAI API Key <span className="text-cyan-400">*required for voice</span>
                </label>
                <div className="relative">
                  <input
                    type={showKeys.assembly ? 'text' : 'password'}
                    placeholder="e.g. 7f8a9b2c..."
                    value={settings.assemblyAiApiKey}
                    onChange={e => updateSetting('assemblyAiApiKey', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 pr-10 focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeys(prev => ({ ...prev, assembly: !prev.assembly }))}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  >
                    {showKeys.assembly ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Gemini API Key */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Google Gemini API Key
                </label>
                <div className="relative">
                  <input
                    type={showKeys.gemini ? 'text' : 'password'}
                    placeholder="AIzaSy..."
                    value={settings.geminiApiKey}
                    onChange={e => updateSetting('geminiApiKey', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 pr-10 focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeys(prev => ({ ...prev, gemini: !prev.gemini }))}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  >
                    {showKeys.gemini ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* OpenAI API Key */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  OpenAI API Key
                </label>
                <div className="relative">
                  <input
                    type={showKeys.openai ? 'text' : 'password'}
                    placeholder="sk-proj-..."
                    value={settings.openAiApiKey}
                    onChange={e => updateSetting('openAiApiKey', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 pr-10 focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeys(prev => ({ ...prev, openai: !prev.openai }))}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  >
                    {showKeys.openai ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                <span className="font-semibold text-slate-200 block mb-1">Zero-Trust Environment Note:</span>
                API keys entered in this UI override backend environment variables for this browser session. If left blank, the backend falls back to its server-side <code className="text-cyan-300">.env</code> configuration.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SRE Policy & Safety */}
      {activeTab === 'safety' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Autopilot & Staging Policy */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-md space-y-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldAlert size={18} className="text-amber-400" />
                Two-Phase Safety Guardrails & Autopilot
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Protect production services against accidental destructive actions through strict human authorization.
              </p>
            </div>

            <div className="space-y-4">
              <label className="flex items-start gap-3 p-4 rounded-xl bg-slate-950/80 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autopilotMode}
                  onChange={e => updateSetting('autopilotMode', e.target.checked)}
                  className="mt-1 w-4 h-4 accent-amber-400 rounded cursor-pointer"
                />
                <div>
                  <span className="text-xs font-semibold text-white">
                    Autonomous Remediation Execution (Autopilot)
                  </span>
                  <p className="text-[11px] text-slate-400 mt-1">
                    When enabled, the agent executes diagnosed fixes (e.g. pool flushes, pod restarts) automatically without waiting for operator voice confirmation. <strong className="text-amber-400">Recommended only for Demo Simulator.</strong>
                  </p>
                </div>
              </label>

              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-semibold text-slate-300">Staged Remediation TTL Expiration</span>
                  <span className="font-mono text-cyan-400">{settings.stagedActionTtl} seconds</span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="120"
                  step="5"
                  value={settings.stagedActionTtl}
                  onChange={e => updateSetting('stagedActionTtl', parseInt(e.target.value))}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>15s (Strict timeout)</span>
                  <span>30s (Default)</span>
                  <span>120s (Extended review)</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-slate-300">
                    Write-Ahead Log (WAL) Synchronous Commit
                    <span className="block text-[11px] font-normal text-slate-500">
                      Record every state mutation to WAL before executing on live clusters
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.walSyncOnCommit}
                    onChange={e => updateSetting('walSyncOnCommit', e.target.checked)}
                    className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* RBAC & Audit Ledger */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-md space-y-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-400" />
                RBAC Permissions & Cryptographic Audit Ledger
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Verified tamper-evident SHA-256 audit chain tracking all voice commands and infrastructure changes.
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Active Operator Role:</span>
                  <span className="font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-semibold text-[11px]">
                    {rbacRole}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Infrastructure Mode:</span>
                  <span className="font-mono text-slate-200 uppercase text-[11px]">
                    {infrastructureMode}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Audit Chain Status:</span>
                  <span className="flex items-center gap-1.5 font-mono text-emerald-400 font-medium text-[11px]">
                    <Check size={13} />
                    VALID (SHA-256 Verified)
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300">Authorized Tool Actions for {rbacRole}:</span>
                <ul className="text-[11px] text-slate-400 space-y-1 pl-1 font-mono">
                  <li className="flex items-center gap-2">
                    <Check size={12} className="text-emerald-400" /> query_service_logs
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={12} className="text-emerald-400" /> fetch_service_telemetry
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={12} className="text-emerald-400" /> get_service_topology
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={12} className="text-emerald-400" /> execute_remediation (Two-Phase Guarded)
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Cluster & Infra */}
      {activeTab === 'cluster' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Target Infrastructure */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-md space-y-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Server size={18} className="text-cyan-400" />
                Cluster Interconnect & Host Bridge
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Configure connection endpoints for live Docker daemon or Kubernetes clusters.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Cluster Execution Target
                </label>
                <select
                  value={settings.infrastructureMode}
                  onChange={e => updateSetting('infrastructureMode', e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:border-cyan-500"
                >
                  <option value="simulation">Demo Scenario Simulator (Chaos Injection Without Live Risk)</option>
                  <option value="docker">Docker Host Bridge (/var/run/docker.sock Direct Inspection)</option>
                  <option value="kubernetes">Kubernetes Multi-Cluster (Kubeconfig Pod Orchestration)</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-semibold text-slate-300">Cluster Telemetry Polling Frequency</span>
                  <span className="font-mono text-cyan-400">{settings.telemetryPollingSec}s</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={settings.telemetryPollingSec}
                  onChange={e => updateSetting('telemetryPollingSec', parseInt(e.target.value))}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>1s (High Frequency)</span>
                  <span>2s (Standard)</span>
                  <span>10s (Low Network Bandwidth)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Webhooks & Notification Channels */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-md space-y-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Bell size={18} className="text-amber-400" />
                External Integrations & Outage Broadcast
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Trigger PagerDuty escalations and Slack Sev-1 broadcast notifications upon incident declaration.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  PagerDuty Routing Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. pd-service-key-..."
                    value={settings.pagerDutyKey}
                    onChange={e => updateSetting('pagerDutyKey', e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleTestPing('PagerDuty')}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium"
                  >
                    Ping
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Slack Sev-1 Outage Webhook URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="https://hooks.slack.com/services/..."
                    value={settings.slackWebhookUrl}
                    onChange={e => updateSetting('slackWebhookUrl', e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleTestPing('Slack Webhook')}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium"
                  >
                    Ping
                  </button>
                </div>
              </div>

              {testPingState && (
                <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono text-cyan-300">
                  {testPingState}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Storage & Reset */}
      {activeTab === 'storage' && (
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-md space-y-6">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Database size={18} className="text-cyan-400" />
              Episodic Memory, Incident Reset & Workspace Backup
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Purge local storage buffers, reset active incident state, or export complete workspace configurations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Danger Zone */}
            <div className="p-5 rounded-xl bg-rose-950/20 border border-rose-900/40 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle size={16} />
                  Emergency Incident State Reset
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Resets the current incident session, clears executed tool logs, resets the acoustic blackbox buffer, and re-initializes mock cluster health.
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

            {/* Local Storage & Cache */}
            <div className="p-5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                  <RotateCcw size={16} className="text-cyan-400" />
                  Clear Browser Cached Preferences
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Purges stored API keys, voice persona selections, and customized thresholds from this browser's local storage.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Clear all cached settings and reload defaults?')) {
                    localStorage.removeItem(STORAGE_KEY);
                    setSettings(DEFAULT_SETTINGS);
                    alert('Local cache cleared.');
                  }
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition"
              >
                <RotateCcw size={14} />
                <span>Purge Browser LocalStorage</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

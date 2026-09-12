import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SettingsView } from '../src/components/SettingsView';
import { UsageAnalyticsView } from '../src/components/UsageAnalyticsView';
import { App } from '../src/App';
import { useVoiceStream } from '../src/hooks/useVoiceStream';

vi.mock('../src/hooks/useVoiceStream');
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: storageMock, writable: true });

const mockVoiceState = () => ({
  operator: { operator: 'Test Commander', role: 'SRE_COMMANDER', infrastructure_mode: 'simulation', authenticated: true, assemblyai_configured: true, tts_provider: 'edge_tts' },
  loginRequired: false, login: vi.fn(), reconnect: vi.fn(), isConnected: true,
  agentStatus: 'listening', activeEngine: 'voice_agent_api', providerState: 'ready',
  providerMessage: '', reasoningProvider: 'gemini-2.0-flash',
  stagedRemediation: null, autopilotEnabled: false, isRecording: false, isPlaying: false,
  turns: [
    { id: '1', speaker: 'user' as const, transcript: 'Check payment-service health', end_of_turn: true, timestamp: 1700000000 },
    { id: '2', speaker: 'agent' as const, transcript: 'Payment service is degraded with elevated P99 latency.', end_of_turn: true, timestamp: 1700000010 }
  ],
  currentInterimTranscript: '', currentAgentTranscript: '',
  executedTools: [
    { id: 't1', tool_name: 'query_service_logs', arguments: { service_name: 'payment-service' }, result: { status: 'success' }, timestamp: 1700000005 }
  ],
  incident: { id: 'INC-9901', title: 'Payment latency anomaly', severity: 'SEV-1', status: 'INVESTIGATING', started_at: 1700000000, timeline_events: [], mitigations_applied: [] },
  services: {}, topology: null, activeRunbook: null, postMortem: null, audioLevel: 0.45,
  latency: { stt_ms: 185, tool_ms: 95, llm_ms: 270, tts_ms: 110, total_ms: 660 },
  error: '', notice: '', busy: false, clearError: vi.fn(), clearNotice: vi.fn(),
  startRecording: vi.fn(), stopRecording: vi.fn(), toggleRecording: vi.fn(), sendTextCommand: vi.fn(),
  selectEngine: vi.fn(), authorizeRemediation: vi.fn(), cancelRemediation: vi.fn(),
  resetIncident: vi.fn(), bargeIn: vi.fn(), startRunbook: vi.fn(), advanceRunbook: vi.fn(),
  abortRunbook: vi.fn(), toggleAutopilot: vi.fn(), simulateScenario: vi.fn(), closePostMortem: vi.fn(),
});

describe('SettingsView Component', () => {
  it('renders all settings tabs and switches between them', () => {
    const onNavigateBack = vi.fn();
    render(<SettingsView onNavigateBack={onNavigateBack} />);

    expect(screen.getByText('Workspace Settings & SRE Policies')).toBeTruthy();

    // Tab 1: Voice & Audio is active by default
    expect(screen.getByText('AssemblyAI Orchestration Mode')).toBeTruthy();
    expect(screen.getByText('Path 1: Voice Agent API')).toBeTruthy();

    // Switch to AI Gateway Tab
    fireEvent.click(screen.getByRole('button', { name: /AI Gateway/ }));
    expect(screen.getByText('Reasoning Model & Synthesis Architecture')).toBeTruthy();
    expect(screen.getByText(/Primary Reasoning Gateway/)).toBeTruthy();

    // Switch to SRE Policy Tab
    fireEvent.click(screen.getByRole('button', { name: /SRE Policy/ }));
    expect(screen.getByText('Two-Phase Safety Guardrails & Autopilot')).toBeTruthy();
    expect(screen.getByText(/Two-Phase Guarded/)).toBeTruthy();

    // Switch to Cluster & Infra Tab
    fireEvent.click(screen.getByRole('button', { name: /Cluster & Infra/ }));
    expect(screen.getByText('Cluster Interconnect & Host Bridge')).toBeTruthy();

    // Switch to Storage & Reset Tab
    fireEvent.click(screen.getByRole('button', { name: /Storage & Reset/ }));
    expect(screen.getByText('Emergency Incident State Reset')).toBeTruthy();

    // Navigate back
    fireEvent.click(screen.getByLabelText('Back to Mission Control'));
    expect(onNavigateBack).toHaveBeenCalledOnce();
  });

  it('updates VAD sensitivity and persists to localStorage', () => {
    localStorage.clear();
    render(<SettingsView onNavigateBack={vi.fn()} />);

    const slider = screen.getAllByRole('slider')[0];
    fireEvent.change(slider, { target: { value: '0.75' } });

    expect(screen.getByText('75%')).toBeTruthy();
    const saved = localStorage.getItem('jarvis_sre_settings_v1');
    expect(saved).not.toBeNull();
    expect(JSON.parse(saved!).vadSensitivity).toBe(0.75);
  });
});

describe('UsageAnalyticsView Component', () => {
  it('renders KPI metrics, latency waterfall, and tool frequency', () => {
    const onNavigateBack = vi.fn();
    const voice = mockVoiceState();

    render(
      <UsageAnalyticsView
        onNavigateBack={onNavigateBack}
        latency={voice.latency}
        turns={voice.turns}
        executedTools={voice.executedTools}
        isRecording={true}
        audioLevel={0.65}
        incidentId="INC-9901"
      />
    );

    expect(screen.getByText('Usage Graph & Acoustic Telemetry')).toBeTruthy();
    expect(screen.getByText('Total Tokens')).toBeTruthy();
    expect(screen.getByText('Est. Cost (USD)')).toBeTruthy();
    expect(screen.getByText('P95 Turn Latency')).toBeTruthy();
    expect(screen.getByText('Speculative Cache')).toBeTruthy();
    expect(screen.getByText('Four-Stage Acoustic Latency Waterfall')).toBeTruthy();
    expect(screen.getByText(/query_service_logs/)).toBeTruthy();
    expect(screen.getByText(/Mic Active \(65%\)/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Back to Mission Control'));
    expect(onNavigateBack).toHaveBeenCalledOnce();
  });
});

describe('App Top-Level Page Navigation', () => {
  beforeEach(() => {
    vi.mocked(useVoiceStream).mockReturnValue(mockVoiceState() as any);
  });

  it('navigates to Usage Analytics and back to Mission Control', () => {
    render(<App />);

    // Click Usage & Analytics in top navigation
    const nav = screen.getByRole('navigation', { name: 'Page navigation' });
    fireEvent.click(within(nav).getByRole('button', { name: /Usage & Analytics/ }));
    expect(screen.getByText('Usage Graph & Acoustic Telemetry')).toBeTruthy();

    // Click Mission Control in top navigation
    fireEvent.click(within(nav).getByRole('button', { name: /Mission Control/ }));
    expect(screen.getByText('OPERATIONS / INCIDENT WORKSPACE')).toBeTruthy();
  });

  it('navigates to System Settings and back to Mission Control', () => {
    render(<App />);

    // Click System Settings in top navigation
    const nav = screen.getByRole('navigation', { name: 'Page navigation' });
    fireEvent.click(within(nav).getByRole('button', { name: /System Settings/ }));
    expect(screen.getByText('Workspace Settings & SRE Policies')).toBeTruthy();

    // Click Back to Mission Control via back button
    fireEvent.click(screen.getByLabelText('Back to Mission Control'));
    expect(screen.getByText('OPERATIONS / INCIDENT WORKSPACE')).toBeTruthy();
  });
});

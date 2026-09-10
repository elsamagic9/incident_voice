import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../src/App';
import { useVoiceStream } from '../src/hooks/useVoiceStream';

vi.mock('../src/hooks/useVoiceStream');
vi.mock('../src/components/AudioOscilloscope', () => ({ AudioOscilloscope: () => null }));

const state = () => ({
  operator: { operator: 'Demo operator', role: 'SRE_COMMANDER', infrastructure_mode: 'simulation', authenticated: false, assemblyai_configured: false, tts_provider: 'browser' },
  loginRequired: false, login: vi.fn(), reconnect: vi.fn(), isConnected: true,
  agentStatus: 'listening', activeEngine: 'custom_stt_v3', providerState: 'unconfigured',
  providerMessage: 'Add an AssemblyAI API key to enable voice.', reasoningProvider: 'scripted',
  stagedRemediation: null, autopilotEnabled: false, isRecording: false, isPlaying: false,
  turns: [], currentInterimTranscript: '', executedTools: [], incident: null, services: {},
  topology: null, activeRunbook: null, postMortem: null, audioLevel: 0,
  latency: { stt_ms: null, tool_ms: null, llm_ms: null, tts_ms: null, total_ms: null },
  error: '', notice: '', busy: false, clearError: vi.fn(), clearNotice: vi.fn(),
  startRecording: vi.fn(), stopRecording: vi.fn(), toggleRecording: vi.fn(), sendTextCommand: vi.fn(),
  selectEngine: vi.fn(), authorizeRemediation: vi.fn(), cancelRemediation: vi.fn(),
  resetIncident: vi.fn(), bargeIn: vi.fn(), startRunbook: vi.fn(), advanceRunbook: vi.fn(),
  abortRunbook: vi.fn(), toggleAutopilot: vi.fn(), simulateScenario: vi.fn(), closePostMortem: vi.fn(),
});

describe('Mission control regression coverage', () => {
  let voice: ReturnType<typeof state>;
  beforeEach(() => { voice = state(); vi.mocked(useVoiceStream).mockReturnValue(voice as ReturnType<typeof useVoiceStream>); });

  it('renders unknown latency without crashing or claiming live Docker', () => {
    render(<App />);
    expect(screen.queryByText('Something went wrong')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(within(screen.getByRole('region', { name: 'Workspace settings' })).getAllByText('—')).toHaveLength(4);
    expect(screen.getByText('Demo simulation · no live changes')).toBeTruthy();
    expect(screen.queryByText('Docker Live (Host)')).toBeNull();
    expect(screen.getByRole('region', { name: 'Investigation tools' })).toBeTruthy();
  });

  it('exposes login and submits the entered operator token', async () => {
    voice.loginRequired = true;
    voice.isConnected = false;
    render(<App />);
    fireEvent.change(screen.getByLabelText('Operator access token'), { target: { value: 'test-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(voice.login).toHaveBeenCalledWith('test-token');
    await waitFor(() => expect((screen.getByLabelText('Operator access token') as HTMLInputElement).value).toBe(''));
  });

  it('shows provider and command errors and exposes reconnect', () => {
    voice.error = 'Microphone permission denied.';
    render(<App />);
    expect(screen.getByRole('alert').textContent).toContain('Microphone permission denied.');
    expect(screen.getByText(voice.providerMessage)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(voice.reconnect).toHaveBeenCalledOnce();
  });

  it.each([
    ['Sev-1 Payment Crash', 'crash_payment'], ['DB Pool Starvation', 'starve_db'],
    ['Ingress Traffic Surge', 'traffic_spike'], ['Self-Healing Restore', 'heal_all'],
  ])('dispatches %s as a scenario command', (label, scenario) => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Demo lab' }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
    expect(voice.simulateScenario).toHaveBeenCalledWith(scenario);
    expect(voice.sendTextCommand).not.toHaveBeenCalled();
  });

  it('hides simulation controls in live infrastructure mode', () => {
    voice.operator.infrastructure_mode = 'docker';
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.queryByRole('button', { name: 'Demo lab' })).toBeNull();
    expect(screen.queryByLabelText('Auto-approve demo actions')).toBeNull();
  });

  it('submits typed commands and keeps voice disabled without credentials', () => {
    render(<App />);
    expect((screen.getByRole('button', { name: 'Start voice' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('SRE command'), { target: { value: 'Check cluster health' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send command' }));
    expect(voice.sendTextCommand).toHaveBeenCalledWith('Check cluster health');
    expect((screen.getByLabelText('SRE command') as HTMLInputElement).value).toBe('');
  });

  it('makes starting voice and stopping a spoken reply accessible', () => {
    voice.operator.assemblyai_configured = true;
    voice.isPlaying = true;
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }));
    expect(voice.toggleRecording).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Stop reply' }));
    expect(voice.bargeIn).toHaveBeenCalledOnce();
  });
});

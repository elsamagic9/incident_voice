import React from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PostMortemViewer } from '../src/components/PostMortemViewer';
import { ServiceHealthMatrix } from '../src/components/ServiceHealthMatrix';
import { ServiceDependencyGraph } from '../src/components/ServiceDependencyGraph';
import type { PostMortemData, ServiceNode } from '../src/types';

const report: PostMortemData = {
  incident_id: 'INC-8942', title: 'Evidence review', severity: 'SEV-1', source: 'local_events',
  infrastructure_mode: 'simulation', incident_status: 'INVESTIGATING',
  generation_warning: 'AssemblyAI is not configured.', mttd_minutes: null, mttr_minutes: null,
  executive_summary: 'Investigation is ongoing.', root_cause: 'Unverified.', timeline: [],
  actions_taken: [], preventive_action_items: [], action_items_tickets: [], markdown_report: '# Local report', slack_briefing: 'Investigation ongoing.',
};

function metadata(audio = false, tampered = false) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('blackbox') ? {
    incident_id: 'INC-8942', audio_url: audio ? '/api/incident/blackbox/audio.wav' : null,
    recorded_tracks: audio ? ['user'] : [], total_duration_seconds: audio ? 2 : 0,
    waveform_peaks: [], markers: [],
  } : {
    compliance_certification: 'No compliance certification', chain_status: tampered ? 'TAMPERING_DETECTED' : 'TAMPER_EVIDENT_VALID',
    total_cryptographic_blocks: 1, merkle_leaf_root_hash: 'abc', audit_timestamp: '', blocks: [],
    failure_details: tampered ? 'Block 1 hash tampered' : null,
  } })));
}

it('keeps empty local results empty instead of inventing tickets', async () => {
  metadata();
  render(<PostMortemViewer data={report} onClose={() => {}} />);
  expect(screen.getByText(/Source: Local event summary/)).toBeTruthy();
  expect(screen.queryByText('Powered by AssemblyAI LeMUR')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Draft tickets (0)' }));
  expect(screen.getByText('No ticket drafts were generated.')).toBeTruthy();
  expect(screen.queryByText(/PgBouncer/)).toBeNull();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
});

it('disables replay when no audio was captured', async () => {
  metadata();
  render(<PostMortemViewer data={report} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Captured audio' }));
  await screen.findByText(/No audio was recorded/);
  expect((screen.getByRole('button', { name: 'Play recording' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByLabelText('Recording time').textContent?.replace(/\s/g, '')).toBe('00:00/00:00');
});

it('reports playback rejection without starting simulated replay', async () => {
  metadata(true);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('blocked'));
  render(<PostMortemViewer data={report} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Captured audio' }));
  const play = screen.getByRole('button', { name: 'Play recording' }) as HTMLButtonElement;
  await waitFor(() => expect(play.disabled).toBe(false));
  fireEvent.click(play);
  await screen.findByRole('alert');
  expect(screen.getByRole('alert').textContent).toContain('Audio playback failed');
  expect(screen.queryByRole('button', { name: 'Pause recording' })).toBeNull();
  expect(screen.getByLabelText('Recording time').textContent?.replace(/\s/g, '')).toBe('00:00/00:02');
});

it('shows actual audit tampering instead of a fixed verification badge', async () => {
  metadata(false, true);
  render(<PostMortemViewer data={report} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Audit chain' }));
  await screen.findByText('Integrity: TAMPERING_DETECTED');
  expect(screen.getByRole('alert').textContent).toContain('Block 1 hash tampered');
  expect(screen.queryByText('100% Verified')).toBeNull();
});

it('handles metadata HTTP failures without fabricating artifacts', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
  render(<PostMortemViewer data={report} onClose={() => {}} />);
  await screen.findByRole('alert');
  expect(screen.getByRole('alert').textContent).toContain('401');
});

it('supports Escape and returns focus after closing the report', async () => {
  metadata();
  const close = vi.fn();
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  trigger.focus();
  const view = render(<PostMortemViewer data={report} onClose={close} />);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close incident review' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});

it('masks unavailable telemetry and marks health unverified', () => {
  const service: ServiceNode = { id: 'payment-service', name: 'Payment', status: 'unknown', metrics_available: false,
    replicas: 2, cpu_percent: 94.5, memory_percent: 89.2, error_rate_pct: 42.6, latency_p99_ms: 2850, active_alerts: [], recent_logs: [] };
  render(<ServiceHealthMatrix services={{ [service.id]: service }} infrastructureMode="docker" />);
  expect(screen.getAllByText('—')).toHaveLength(4);
  expect(screen.getByLabelText('Health unverified')).toBeTruthy();
  expect(screen.queryByText('2850ms')).toBeNull();
});

it('does not invent a live topology when the backend has none', () => {
  render(<ServiceDependencyGraph topology={{ nodes: [], edges: [], blast_radius_service_ids: [], cascading_failure_active: false, total_cluster_rps: 0 }} />);
  expect(screen.getByText(/Live dependency topology is not configured/)).toBeTruthy();
  expect(screen.queryByText(/Cascading Blast Radius/)).toBeNull();
});

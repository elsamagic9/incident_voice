import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { InvestigationPanel } from '../src/components/InvestigationPanel';
import type { InvestigationBrief, RecoveryCheck } from '../src/types';
const brief: InvestigationBrief = {
  id: 'brief-1', incident_id: 'INC-1', source: 'simulation', analysis_source: 'assemblyai_llm_gateway',
  captured_at: 100, summary: 'Database saturation may affect checkout.', stale: false, warning: null, gaps: [],
  baseline: { 'order-db': { status: 'critical', replicas: 2, latency_p99_ms: 1450, error_rate_pct: 12 } }, current: {},
  evidence: [{ id: 'E01', service: 'order-db', kind: 'log', detail: 'max_connections reached', source: 'simulation' }],
  hypotheses: [{ title: 'Database saturation', service: 'order-db', reason: 'The database reports exhausted connections.', evidence_ids: ['E01'], next_check: 'Inspect lock waits.' }],
};
it('starts a read-only brief through the actual command path', () => {
  const command = vi.fn();
  render(<InvestigationPanel brief={null} checks={[]} disabled={false} onCommand={command} />);
  fireEvent.click(screen.getByRole('button', { name: 'Build incident brief' }));
  expect(command).toHaveBeenCalledWith('Investigate the incident');
});
it('focuses cited source evidence and offers a diagnostic action', () => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true });
  const command = vi.fn();
  render(<InvestigationPanel brief={brief} checks={[]} disabled={false} onCommand={command} />);
  fireEvent.click(screen.getByRole('button', { name: 'View evidence E01' }));
  expect(document.activeElement?.id).toBe('evidence-E01');
  fireEvent.click(screen.getByRole('button', { name: 'Inspect order-db' }));
  expect(command).toHaveBeenCalledWith('Inspect logs for order-db');
  expect(screen.getByText('HYPOTHESIS · UNVERIFIED')).toBeTruthy();
});
it('marks a stale hypothesis and a stale recovery check explicitly', () => {
  render(<InvestigationPanel brief={{ ...brief, stale: true, verification: { recovery_verified: true, stale: true, captured_at: 101, remaining_services: [], message: 'Earlier health check passed.' } }} checks={[]} disabled={false} onCommand={vi.fn()} />);
  expect(screen.getByRole('status').textContent).toContain('Service state has changed');
  expect(screen.getByText('The last recovery check is out of date')).toBeTruthy();
});
it('keeps target recovery separate from full incident recovery', () => {
  const receipt: RecoveryCheck = { id: 'check-1', source: 'simulation', action: 'restart_pod', service: 'payment-service', captured_at: 101, outcome: 'healthy', message: 'Restarted', before: { status: 'critical', replicas: 2, error_rate_pct: 42.6, latency_p99_ms: 2850 }, after: { status: 'healthy', replicas: 2, error_rate_pct: .5, latency_p99_ms: 65 } };
  render(<InvestigationPanel brief={brief} checks={[receipt]} disabled={false} onCommand={vi.fn()} />);
  expect(screen.getByText('The target is healthy.')).toBeTruthy();
  expect(screen.getByText(/other services may still be affected/)).toBeTruthy();
  expect(screen.getByText('42.6%')).toBeTruthy();
  expect(screen.getByText('0.5%')).toBeTruthy();
});

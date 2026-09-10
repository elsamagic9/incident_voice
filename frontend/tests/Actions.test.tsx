import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ApprovalCard } from '../src/components/ApprovalCard';
import { ToolExecutionCard } from '../src/components/ToolExecutionCard';

it('describes the exact action and allows approval or cancellation', () => {
  const approve = vi.fn(), cancel = vi.fn();
  render(<ApprovalCard action={{ id: 'action-1', action: 'scale_replicas', service_name: 'payment-service', params: { count: 8 }, simulated: true, expires_at: Date.now() / 1000 + 30 }} disabled={false} onApprove={approve} onCancel={cancel} />);
  expect(screen.getByRole('heading').textContent).toContain('8 replicas');
  fireEvent.click(screen.getByRole('button', { name: 'Approve action' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(approve).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledOnce();
});

it('disables expired approval', () => {
  render(<ApprovalCard action={{ action: 'restart_pod', service_name: 'payment-service', expires_at: Date.now() / 1000 - 1 }} disabled={false} onApprove={() => {}} onCancel={() => {}} />);
  expect((screen.getByRole('button', { name: 'Approve action' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Approval expired')).toBeTruthy();
});

it('distinguishes staging from completed execution in the activity feed', () => {
  render(<ToolExecutionCard tool={{ id: 'tool-1', tool_name: 'execute_remediation', arguments: { service_name: 'payment-service' }, result: { status: 'staged' }, timestamp: 1 }} />);
  expect(screen.getByText(/needs approval/i)).toBeTruthy();
  expect(screen.queryByText('Completed')).toBeNull();
});

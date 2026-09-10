import React from 'react';
import { ArrowUpRight, Database, FlaskConical, RotateCcw, ServerCrash, TrendingUp } from 'lucide-react';

interface Props { onTriggerChaos: (scenario: string) => void; disabled?: boolean; }
const scenarios = [
  { id: 'crash_payment', label: 'Sev-1 Payment Crash', text: 'Simulate a payment outage with elevated errors.', icon: ServerCrash, color: 'status-danger' },
  { id: 'starve_db', label: 'DB Pool Starvation', text: 'Exhaust database connections to rehearse a runbook.', icon: Database, color: 'status-warning' },
  { id: 'traffic_spike', label: 'Ingress Traffic Surge', text: 'Increase incoming traffic and inspect the impact.', icon: TrendingUp, color: 'status-info' },
  { id: 'heal_all', label: 'Self-Healing Restore', text: 'Restore all simulated services to healthy values.', icon: RotateCcw, color: 'status-good' },
];
export const LiveTelemetryDrawer: React.FC<Props> = ({ onTriggerChaos, disabled }) => <div className="demo-lab"><div className="demo-notice"><FlaskConical size={19} /><div><h3>A safe place to practice</h3><p>These scenarios change demo data only. Pick one, then ask the copilot to investigate.</p></div></div><div className="scenario-grid">{scenarios.map(({ id, label, text, icon: Icon, color }) => <button key={id} disabled={disabled} onClick={() => onTriggerChaos(id)} className="scenario-card"><span className={`icon-tile ${color}`}><Icon size={21} /></span><strong>{label}</strong><p>{text}</p><span className="scenario-link">{id === 'heal_all' ? 'Restore demo' : 'Try scenario'}<ArrowUpRight size={14} /></span></button>)}</div></div>;

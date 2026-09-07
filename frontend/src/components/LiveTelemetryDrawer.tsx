import React from 'react';
import { HardDrive, Flame, Zap, CheckCircle2, Terminal } from 'lucide-react';

interface Props {
  onTriggerChaos: (scenario: string) => void;
  onLaunchDocker: () => void;
}

export const LiveTelemetryDrawer: React.FC<Props> = ({ onTriggerChaos }) => {
  return (
    <div className="bg-[#101522] rounded-xl border border-slate-800 p-3.5 shadow-xl text-xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold uppercase tracking-wider text-slate-200">
            SRE Chaos Injection & Demo Controls
          </h3>
        </div>
        <span className="text-[10px] font-mono text-slate-400">
          Simulate production outage scenarios for judges
        </span>
      </div>

      {/* Quick Action Chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onTriggerChaos('crash_payment')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-700/50 transition font-mono"
        >
          <Flame className="w-3.5 h-3.5 text-red-400" /> Trigger P1 Outage (HTTP 503)
        </button>

        <button
          onClick={() => onTriggerChaos('starve_db')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border border-amber-700/50 transition font-mono"
        >
          <HardDrive className="w-3.5 h-3.5 text-amber-400" /> Exhaust DB Connection Pool
        </button>

        <button
          onClick={() => onTriggerChaos('traffic_spike')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 border border-cyan-700/50 transition font-mono"
        >
          <Zap className="w-3.5 h-3.5 text-cyan-400" /> Simulate Traffic Spike (10k RPS)
        </button>

        <button
          onClick={() => onTriggerChaos('heal_all')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-700/50 transition font-mono"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Restore All Nominal
        </button>
      </div>
    </div>
  );
};

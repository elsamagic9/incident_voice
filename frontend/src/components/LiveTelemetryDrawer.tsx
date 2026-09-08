import React from 'react';
import { HardDrive, Flame, Zap, CheckCircle2, Terminal, AlertTriangle } from 'lucide-react';

interface Props {
  onTriggerChaos: (scenario: string) => void;
  onLaunchDocker: () => void;
}

export const LiveTelemetryDrawer: React.FC<Props> = ({ onTriggerChaos }) => {
  return (
    <div className="glass-panel rounded-2xl border border-white/[0.08] p-4 sm:p-5 shadow-2xl text-xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-500/20 via-rose-500/20 to-transparent border border-red-500/40 text-red-400 shadow-inner">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold uppercase tracking-wider text-slate-100 font-sans">
              SRE Chaos Injection & Demonstration Console
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              Live deterministic failure simulation engine for judge evaluation
            </span>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-slate-900 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          Real Fault Injection
        </span>
      </div>

      {/* Scenario Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Scenario 1: Payment Crash */}
        <div
          onClick={() => onTriggerChaos('crash_payment')}
          className="glass-panel-subtle p-3.5 rounded-2xl border border-red-500/40 hover:border-red-400/70 hover:bg-red-950/20 transition-all duration-200 cursor-pointer shadow-lg hover:scale-[1.02] group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/40">
                <Flame className="w-4 h-4 text-red-400 group-hover:animate-bounce" />
              </div>
              <span className="font-bold text-white text-xs font-sans">Sev-1 Payment Crash</span>
            </div>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-500/40 font-semibold">
              42% 503 ERROR
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Injects worker thread crash into <code className="text-red-300">payment-service</code>, triggering cascading checkout failures.
          </p>
        </div>

        {/* Scenario 2: DB Pool Exhaustion */}
        <div
          onClick={() => onTriggerChaos('starve_db')}
          className="glass-panel-subtle p-3.5 rounded-2xl border border-amber-500/40 hover:border-amber-400/70 hover:bg-amber-950/20 transition-all duration-200 cursor-pointer shadow-lg hover:scale-[1.02] group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40">
                <HardDrive className="w-4 h-4 text-amber-400 group-hover:animate-bounce" />
              </div>
              <span className="font-bold text-white text-xs font-sans">DB Pool Starvation</span>
            </div>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-500/40 font-semibold">
              200/200 HANDLES
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Saturates PostgreSQL client connections, driving P99 database query latency to 1,450ms.
          </p>
        </div>

        {/* Scenario 3: Traffic Spike */}
        <div
          onClick={() => onTriggerChaos('traffic_spike')}
          className="glass-panel-subtle p-3.5 rounded-2xl border border-cyan-500/40 hover:border-cyan-400/70 hover:bg-cyan-950/20 transition-all duration-200 cursor-pointer shadow-lg hover:scale-[1.02] group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                <Zap className="w-4 h-4 text-cyan-400 group-hover:animate-bounce" />
              </div>
              <span className="font-bold text-white text-xs font-sans">Ingress Traffic Surge</span>
            </div>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-semibold">
              10,000 RPS
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Simulates flash-sale ingress traffic flood against Envoy gateway, saturating rate limiters.
          </p>
        </div>

        {/* Scenario 4: Heal All */}
        <div
          onClick={() => onTriggerChaos('heal_all')}
          className="glass-panel-subtle p-3.5 rounded-2xl border border-emerald-500/40 hover:border-emerald-400/70 hover:bg-emerald-950/20 transition-all duration-200 cursor-pointer shadow-lg hover:scale-[1.02] group glow-green"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 group-hover:animate-bounce" />
              </div>
              <span className="font-bold text-white text-xs font-sans">Self-Healing Restore</span>
            </div>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-semibold">
              ALL NOMINAL
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Rolls replacement pods, drains connection pools, and restores healthy cluster mesh status.
          </p>
        </div>
      </div>
    </div>
  );
};

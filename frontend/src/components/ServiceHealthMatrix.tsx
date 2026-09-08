import React from 'react';
import { Server, AlertTriangle, CheckCircle2, Cpu, Database, Network } from 'lucide-react';
import { ServiceNode } from '../types';

interface Props {
  services: Record<string, ServiceNode>;
}

export const ServiceHealthMatrix: React.FC<Props> = ({ services }) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'critical':
        return <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse drop-shadow-[0_0_8px_#ef4444]" />;
      case 'degraded':
        return <AlertTriangle className="w-4 h-4 text-amber-400 drop-shadow-[0_0_8px_#f59e0b]" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_8px_#10b981]" />;
    }
  };

  const getStatusBorder = (status: string) => {
    switch (status) {
      case 'critical':
        return 'border-red-500/60 bg-red-950/20 glow-red';
      case 'degraded':
        return 'border-amber-500/50 bg-amber-950/20 glow-amber';
      default:
        return 'border-emerald-500/30 bg-emerald-950/10 hover:border-emerald-500/50';
    }
  };

  return (
    <div className="glass-panel rounded-2xl border border-white/[0.08] p-4 sm:p-5 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-300 border border-cyan-500/40 shadow-inner">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100 font-sans">
              Microservice Topology & Telemetry Matrix
            </h3>
            <span className="text-[10px] font-mono text-slate-400">Production Kubernetes Cluster · Envoy Mesh</span>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-slate-900/80 text-slate-300 border border-white/[0.08]">
          {Object.keys(services).length} Services Monitored
        </span>
      </div>

      {Object.keys(services).length === 0 ? (
        <div className="h-40 flex flex-col items-center justify-center text-slate-500 text-xs font-mono border border-dashed border-white/[0.08] rounded-2xl bg-slate-950/40">
          <Server className="w-8 h-8 text-slate-600 mb-2 animate-pulse" />
          <span>Awaiting cluster telemetry stream...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {Object.values(services).map((svc) => (
            <div
              key={svc.id}
              className={`glass-panel-subtle p-3.5 rounded-2xl border transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 shadow-lg ${getStatusBorder(svc.status)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-slate-800/80 border border-white/[0.06] text-slate-300">
                    {svc.id.includes('db') ? (
                      <Database className="w-3.5 h-3.5 text-amber-400" />
                    ) : svc.id.includes('gateway') ? (
                      <Network className="w-3.5 h-3.5 text-cyan-400" />
                    ) : (
                      <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-xs text-white block">{svc.name}</span>
                    <span className="text-[9px] font-mono text-slate-500 uppercase">{svc.status}</span>
                  </div>
                </div>
                {getStatusIcon(svc.status)}
              </div>

              {/* Metrics Grid */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-white/[0.06] shadow-inner">
                  <span className="text-slate-400 block text-[9px] font-bold">P99 LATENCY</span>
                  <span className={svc.latency_p99_ms > 500 ? 'text-red-400 font-extrabold' : 'text-slate-100 font-semibold'}>
                    {svc.latency_p99_ms.toFixed(0)}ms
                  </span>
                </div>
                <div className="bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-white/[0.06] shadow-inner">
                  <span className="text-slate-400 block text-[9px] font-bold">ERROR RATE</span>
                  <span className={svc.error_rate_pct > 5 ? 'text-red-400 font-extrabold' : 'text-emerald-400 font-semibold'}>
                    {svc.error_rate_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-white/[0.06] shadow-inner">
                  <span className="text-slate-400 block text-[9px] font-bold">REPLICAS</span>
                  <span className="text-slate-100 font-semibold">{svc.replicas} pods</span>
                </div>
                <div className="bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-white/[0.06] shadow-inner">
                  <span className="text-slate-400 block text-[9px] font-bold">CPU LOAD</span>
                  <span className={svc.cpu_percent > 80 ? 'text-amber-400 font-extrabold' : 'text-slate-100 font-semibold'}>
                    {svc.cpu_percent.toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Active alerts */}
              {svc.active_alerts.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {svc.active_alerts.map((alert, idx) => (
                    <span
                      key={idx}
                      className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-red-950/80 text-red-300 border border-red-500/40 font-semibold shadow-sm"
                    >
                      ⚠ {alert}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

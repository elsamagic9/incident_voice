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
        return <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />;
      case 'degraded':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    }
  };

  const getStatusBorder = (status: string) => {
    switch (status) {
      case 'critical':
        return 'border-red-500/60 bg-red-950/20 glow-red';
      case 'degraded':
        return 'border-amber-500/50 bg-amber-950/15';
      default:
        return 'border-emerald-500/30 bg-emerald-950/10';
    }
  };

  return (
    <div className="bg-[#101522] rounded-xl border border-slate-800 p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Microservice Topology & Telemetry</h3>
        </div>
        <span className="text-[11px] font-mono text-slate-400">Kubernetes Production Cluster</span>
      </div>

      {Object.keys(services).length === 0 ? (
        <div className="h-32 flex items-center justify-center text-slate-500 text-xs font-mono border border-dashed border-slate-700/50 rounded-lg bg-slate-900/30">
          Awaiting cluster telemetry...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.values(services).map((svc) => (
            <div
              key={svc.id}
              className={`p-3 rounded-lg border transition-all duration-300 ${getStatusBorder(svc.status)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {svc.id.includes('db') ? (
                    <Database className="w-4 h-4 text-slate-400" />
                  ) : svc.id.includes('gateway') ? (
                    <Network className="w-4 h-4 text-slate-400" />
                  ) : (
                    <Cpu className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="font-semibold text-xs text-slate-200">{svc.name}</span>
                </div>
                {getStatusIcon(svc.status)}
              </div>

              {/* Metrics */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="bg-slate-900/80 px-2 py-1 rounded border border-slate-800/80">
                  <span className="text-slate-500 block text-[9px]">P99 LATENCY</span>
                  <span className={svc.latency_p99_ms > 500 ? 'text-red-400 font-bold' : 'text-slate-200'}>
                    {svc.latency_p99_ms.toFixed(0)}ms
                  </span>
                </div>
                <div className="bg-slate-900/80 px-2 py-1 rounded border border-slate-800/80">
                  <span className="text-slate-500 block text-[9px]">ERROR RATE</span>
                  <span className={svc.error_rate_pct > 5 ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                    {svc.error_rate_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="bg-slate-900/80 px-2 py-1 rounded border border-slate-800/80">
                  <span className="text-slate-500 block text-[9px]">REPLICAS</span>
                  <span className="text-slate-200">{svc.replicas} pods</span>
                </div>
                <div className="bg-slate-900/80 px-2 py-1 rounded border border-slate-800/80">
                  <span className="text-slate-500 block text-[9px]">CPU LOAD</span>
                  <span className={svc.cpu_percent > 80 ? 'text-amber-400' : 'text-slate-200'}>
                    {svc.cpu_percent.toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Active alerts */}
              {svc.active_alerts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {svc.active_alerts.map((alert, idx) => (
                    <span
                      key={idx}
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-700/50"
                    >
                      {alert}
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

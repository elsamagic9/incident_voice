import React from 'react';
import { ArrowUpRight, Check, CircleHelp, Database, Server, AlertTriangle } from 'lucide-react';
import type { ServiceNode } from '../types';

interface Props {
  services: Record<string, ServiceNode>;
  infrastructureMode?: string;
  onInspect?: (service: string) => void;
  disabled?: boolean;
}

export const ServiceHealthMatrix: React.FC<Props> = ({
  services,
  infrastructureMode,
  onInspect,
  disabled,
}) => {
  const order: Record<string, number> = { critical: 0, degraded: 1, unknown: 2, healthy: 3 };
  const nodes = Object.values(services).sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));

  return (
    <div className="service-list">
      <div className="service-list-caption">
        <span className="font-mono text-slate-400">
          {infrastructureMode === 'simulation'
            ? 'Simulated service health'
            : 'Configured infrastructure health'}
        </span>
        <span className="text-slate-500 font-mono text-[10px]">Severity first</span>
      </div>

      {!nodes.length && (
        <div className="diagnostic-empty py-12 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 mb-3">
            <Server size={24} />
          </div>
          <h3 className="text-slate-200 font-semibold text-sm">Awaiting Cluster Telemetry</h3>
          <p className="text-slate-400 text-xs mt-1 max-w-sm">
            Connect to an incident session to stream real-time latency, error rates, and CPU metrics across services.
          </p>
        </div>
      )}

      {nodes.map(service => {
        const known = service.metrics_available !== false;
        const isCritical = service.status === 'critical';
        const isDegraded = service.status === 'degraded';
        const isHealthy = service.status === 'healthy';

        const statusTagClass = isCritical
          ? 'status-danger'
          : isDegraded
          ? 'status-warning'
          : isHealthy
          ? 'status-good'
          : 'bg-slate-800 text-slate-400 border-slate-700';

        const iconColor = isCritical
          ? 'text-rose-400 bg-rose-500/15 border-rose-500/30'
          : isDegraded
          ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
          : isHealthy
          ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
          : 'text-slate-400 bg-slate-800 border-slate-700';

        const cpuWidth = known ? Math.min(100, Math.max(5, service.cpu_percent)) : 0;
        const cpuColor = service.cpu_percent > 85 ? 'bg-rose-500' : service.cpu_percent > 65 ? 'bg-amber-500' : 'bg-cyan-500';

        return (
          <article key={service.id} className="service-row group">
            <div className="service-row-heading">
              <span className={`service-icon ${iconColor} transition-transform group-hover:scale-105`}>
                {service.id.includes('db') || service.id.includes('redis') ? (
                  <Database size={18} />
                ) : (
                  <Server size={18} />
                )}
              </span>

              <div className="service-identity">
                <div className="flex items-center gap-2">
                  <h3 className="font-mono text-[13px] text-slate-200 font-semibold group-hover:text-cyan-300 transition-colors">
                    {service.id}
                  </h3>
                  {service.replicas != null && service.replicas > 1 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-400 border border-slate-700/60">
                      {service.replicas} pods
                    </span>
                  )}
                </div>
                <p className="text-slate-400 text-xs">{service.name}</p>
              </div>

              <span className={`status-tag ${statusTagClass}`}>
                {service.status === 'unknown' ? (
                  <CircleHelp size={12} aria-label="Health unverified" />
                ) : isHealthy ? (
                  <Check size={12} className="text-emerald-400" />
                ) : (
                  <span className={`status-dot ${isCritical ? 'dot-warning animate-ping' : 'dot-warning'}`} />
                )}
                <span className="uppercase text-[10px] font-mono font-bold tracking-wider">
                  {service.status === 'unknown' ? 'Unverified' : service.status}
                </span>
              </span>
            </div>

            {/* Metric Metrics Grid */}
            <dl className="service-metrics">
              <div>
                <dt>P99 Latency</dt>
                <dd className={`font-mono ${known && service.latency_p99_ms > 1000 ? 'text-rose-400 font-bold' : known && service.latency_p99_ms > 300 ? 'text-amber-400' : 'text-slate-200'}`}>
                  {known ? `${service.latency_p99_ms.toFixed(0)} ms` : '—'}
                </dd>
              </div>

              <div>
                <dt>Error Rate</dt>
                <dd className={`font-mono ${known && service.error_rate_pct > 5 ? 'text-rose-400 font-bold' : known && service.error_rate_pct > 1 ? 'text-amber-400' : 'text-slate-200'}`}>
                  {known ? `${service.error_rate_pct.toFixed(1)}%` : '—'}
                </dd>
              </div>

              <div>
                <dt>CPU Load</dt>
                <dd className="font-mono flex items-center gap-2">
                  <span>{known ? `${service.cpu_percent.toFixed(0)}%` : '—'}</span>
                  {known && (
                    <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden shrink-0">
                      <div className={`h-full ${cpuColor} rounded-full`} style={{ width: `${cpuWidth}%` }} />
                    </div>
                  )}
                </dd>
              </div>

              <div>
                <dt>Memory</dt>
                <dd className="font-mono text-slate-200">
                  {known ? `${service.memory_percent.toFixed(0)}%` : '—'}
                </dd>
              </div>
            </dl>

            {/* Service Alert & Quick Actions */}
            {(service.active_alerts.length > 0 || onInspect) && (
              <div className="service-row-footer">
                <span className="service-alert flex items-center gap-1.5" title={service.active_alerts.join(', ')}>
                  {service.active_alerts.length > 0 ? (
                    <>
                      <AlertTriangle size={12} className="text-rose-400 shrink-0" />
                      <span className="text-rose-300 font-mono text-[11px] font-medium">
                        {service.active_alerts[0]}
                        {service.active_alerts.length > 1 && ` (+${service.active_alerts.length - 1} more)`}
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-500 font-mono text-[11px]">No active anomaly alerts</span>
                  )}
                </span>

                {onInspect && (
                  <button
                    className="text-button text-xs hover:text-cyan-300 flex items-center gap-1 font-medium"
                    onClick={() => onInspect(service.id)}
                    disabled={disabled}
                    aria-label={`Inspect ${service.id} logs`}
                  >
                    <span>Inspect logs</span>
                    <ArrowUpRight size={13} />
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};

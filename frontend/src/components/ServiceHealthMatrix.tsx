import React from 'react';
import { ArrowUpRight, Check, CircleHelp, Database, Server, AlertTriangle } from 'lucide-react';
import type { ServiceNode } from '../types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs px-1 text-muted-foreground font-mono">
        <span>
          {infrastructureMode === 'simulation'
            ? 'Simulated service health'
            : 'Configured infrastructure health'}
        </span>
        <span className="text-[10px]">Severity first</span>
      </div>

      {!nodes.length && (
        <div className="py-12 text-center flex flex-col items-center justify-center border border-dashed border-border rounded-xl bg-card/40">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground mb-3">
            <Server size={20} />
          </div>
          <h3 className="font-semibold text-sm text-foreground">Awaiting Cluster Telemetry</h3>
          <p className="text-muted-foreground text-xs mt-1 max-w-sm">
            Connect to an incident session to stream real-time latency, error rates, and CPU metrics across services.
          </p>
        </div>
      )}

      {nodes.map(service => {
        const known = service.metrics_available !== false;
        const isCritical = service.status === 'critical';
        const isDegraded = service.status === 'degraded';
        const isHealthy = service.status === 'healthy';

        const badgeVariant = isCritical
          ? 'destructive'
          : isDegraded
          ? 'warning'
          : isHealthy
          ? 'success'
          : 'secondary';

        return (
          <Card key={service.id} className="border-border bg-card shadow-sm hover:border-border/80 transition-all p-4 space-y-3">
            {/* Header: Identity & Status Badge */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
                  {service.id.includes('db') || service.id.includes('redis') ? (
                    <Database size={15} />
                  ) : (
                    <Server size={15} />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-xs font-semibold text-foreground truncate">
                      {service.id}
                    </h3>
                    {service.replicas != null && service.replicas > 1 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border">
                        {service.replicas} pods
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs truncate">{service.name}</p>
                </div>
              </div>

              <Badge variant={badgeVariant as any} className="gap-1 text-[10px] font-mono uppercase">
                {service.status === 'unknown' ? (
                  <CircleHelp size={11} aria-label="Health unverified" />
                ) : isCritical ? (
                  <AlertTriangle size={11} />
                ) : isHealthy ? (
                  <Check size={11} />
                ) : null}
                <span>{service.status}</span>
              </Badge>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-border/60 text-xs">
              <div>
                <span className="text-[10px] font-mono uppercase text-muted-foreground block">P99 Latency</span>
                <span className={`font-mono font-semibold ${isCritical ? 'text-destructive' : 'text-foreground'}`}>
                  {known ? `${service.latency_p99_ms.toFixed(0)} ms` : '—'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase text-muted-foreground block">Error Rate</span>
                <span className={`font-mono font-semibold ${isCritical || isDegraded ? 'text-destructive' : 'text-foreground'}`}>
                  {known ? `${service.error_rate_pct.toFixed(1)}%` : '—'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase text-muted-foreground block">CPU Load</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono font-semibold text-foreground">
                    {known ? `${service.cpu_percent.toFixed(0)}%` : '—'}
                  </span>
                  {known && (
                    <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${service.cpu_percent > 85 ? 'bg-destructive' : service.cpu_percent > 65 ? 'bg-amber-500' : 'bg-primary'}`}
                        style={{ width: `${Math.min(100, service.cpu_percent)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase text-muted-foreground block">Memory</span>
                <span className="font-mono font-semibold text-foreground">
                  {known ? `${service.memory_percent.toFixed(0)}%` : '—'}
                </span>
              </div>
            </div>

            {/* Active Alerts & Inspect Logs Button */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {service.active_alerts?.length ? (
                  <span className="text-[11px] font-mono text-destructive flex items-center gap-1 truncate">
                    <AlertTriangle size={12} className="shrink-0" />
                    <span>{service.active_alerts[0]}</span>
                    {service.active_alerts.length > 1 && (
                      <span className="text-muted-foreground">+{service.active_alerts.length - 1} more</span>
                    )}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Check size={12} className="text-emerald-500" /> All probes nominal
                  </span>
                )}
              </div>

              {onInspect && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onInspect(service.id)}
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground font-mono shrink-0"
                >
                  <span>Inspect {service.id} logs</span>
                  <ArrowUpRight size={12} className="ml-1" />
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
};

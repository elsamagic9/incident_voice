import React, { useState } from 'react';
import {
  Network, Server, ShieldAlert, Zap
} from 'lucide-react';
import { ServiceTopology, TopologyNode, TopologyEdge } from '../types';

interface Props {
  topology: ServiceTopology | null;
  onSendAction?: (cmd: string) => void;
}

export const ServiceDependencyGraph: React.FC<Props> = ({ topology, onSendAction }) => {
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);

  // Fallback default topology if not yet received via WebSocket
  const nodes: TopologyNode[] = topology?.nodes || [
    {
      id: 'client-traffic',
      name: 'External Client Traffic',
      type: 'client',
      status: 'healthy',
      rps: 8400,
      latency_p99_ms: 12,
      cpu_percent: 10,
      memory_percent: 15,
      error_rate_pct: 0,
      is_blast_radius: false,
      is_bottleneck: false,
      active_alerts: [],
      x: 60,
      y: 160
    },
    {
      id: 'ingress-gateway',
      name: 'Envoy Ingress Gateway',
      type: 'gateway',
      status: 'degraded',
      rps: 8400,
      latency_p99_ms: 480,
      cpu_percent: 68.2,
      memory_percent: 55,
      error_rate_pct: 14.8,
      is_blast_radius: true,
      is_bottleneck: false,
      active_alerts: ['HighDownstream5xxRate'],
      x: 270,
      y: 160
    },
    {
      id: 'auth-service',
      name: 'Auth Broker (OAuth2)',
      type: 'service',
      status: 'healthy',
      rps: 2100,
      latency_p99_ms: 18,
      cpu_percent: 18,
      memory_percent: 32,
      error_rate_pct: 0.01,
      is_blast_radius: false,
      is_bottleneck: false,
      active_alerts: [],
      x: 500,
      y: 60
    },
    {
      id: 'payment-service',
      name: 'Payment Processing Core',
      type: 'service',
      status: 'critical',
      rps: 6300,
      latency_p99_ms: 2850,
      cpu_percent: 94.5,
      memory_percent: 89.2,
      error_rate_pct: 42.6,
      is_blast_radius: true,
      is_bottleneck: true,
      active_alerts: ['PodCrashLoopBackoff', 'PostgresPoolExhausted'],
      x: 500,
      y: 260
    },
    {
      id: 'order-db',
      name: 'PostgreSQL Primary Pool',
      type: 'database',
      status: 'critical',
      rps: 4200,
      latency_p99_ms: 1450,
      cpu_percent: 88.4,
      memory_percent: 91,
      error_rate_pct: 12,
      is_blast_radius: true,
      is_bottleneck: true,
      active_alerts: ['ConnectionCountMaxed'],
      x: 740,
      y: 180
    },
    {
      id: 'redis-cache',
      name: 'Redis Cluster (Locks & Cache)',
      type: 'cache',
      status: 'degraded',
      rps: 5100,
      latency_p99_ms: 180,
      cpu_percent: 72,
      memory_percent: 81,
      error_rate_pct: 6.5,
      is_blast_radius: true,
      is_bottleneck: false,
      active_alerts: ['MemoryUsageAbove80Pct'],
      x: 740,
      y: 330
    }
  ];

  const edges: TopologyEdge[] = topology?.edges || [
    { id: 'e1', source: 'client-traffic', target: 'ingress-gateway', rps: 8400, latency_ms: 14, status: 'healthy', error_rate_pct: 0, protocol: 'HTTPS' },
    { id: 'e2', source: 'ingress-gateway', target: 'auth-service', rps: 2100, latency_ms: 18, status: 'healthy', error_rate_pct: 0.01, protocol: 'gRPC' },
    { id: 'e3', source: 'ingress-gateway', target: 'payment-service', rps: 6300, latency_ms: 2850, status: 'critical', error_rate_pct: 42.6, protocol: 'gRPC' },
    { id: 'e4', source: 'payment-service', target: 'order-db', rps: 4200, latency_ms: 1450, status: 'critical', error_rate_pct: 12, protocol: 'TCP / Pool' },
    { id: 'e5', source: 'payment-service', target: 'redis-cache', rps: 5100, latency_ms: 180, status: 'congested', error_rate_pct: 6.5, protocol: 'RESP' }
  ];

  const blastRadius = topology?.blast_radius_service_ids || ['payment-service', 'order-db', 'redis-cache', 'ingress-gateway'];
  const hasCascading = topology?.cascading_failure_active ?? true;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.15)', text: 'text-red-400', border: 'border-red-500' };
      case 'degraded': return { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.15)', text: 'text-amber-400', border: 'border-amber-500' };
      default: return { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.12)', text: 'text-emerald-400', border: 'border-emerald-500' };
    }
  };

  const getEdgeColor = (status: string) => {
    switch (status) {
      case 'critical': return '#ef4444';
      case 'congested': return '#f59e0b';
      default: return '#06b6d4';
    }
  };

  return (
    <div className="glass-panel rounded-2xl border border-white/[0.08] p-4 sm:p-5 shadow-2xl flex flex-col gap-3.5 relative overflow-hidden">
      {/* Topology Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-300 border border-cyan-500/40 shadow-inner">
            <Network className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100 font-sans">
                Live Service Dependency Graph & Blast Radius
              </h3>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-mono flex items-center gap-1 font-semibold">
                <Zap className="w-3 h-3 text-cyan-400" /> Real-Time Traffic Flow
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Interactive topology map tracing request bottlenecks and cascading failure propagation.
            </p>
          </div>
        </div>

        {hasCascading && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-red-950/70 border border-red-500/60 text-red-300 text-[11px] font-mono animate-pulse shadow-sm glow-red">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span className="font-bold">Cascading Blast Radius: {blastRadius.length} services</span>
          </div>
        )}
      </div>

      {/* SVG Dependency Graph Canvas */}
      <div className="w-full bg-slate-950/80 rounded-xl border border-white/[0.06] relative overflow-hidden h-[340px] flex items-center justify-center shadow-inner">
        {/* Ambient Grid Pattern */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
          <defs>
            <pattern id="topo-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#334155" strokeWidth="0.75" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#topo-grid)" />
        </svg>

        <svg viewBox="0 0 860 410" className="w-full h-full select-none">
          <defs>
            {/* Pulsing blast radius glow filter */}
            <filter id="blast-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            {/* Arrow marker */}
            <marker id="arrow-head-healthy" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#06b6d4" />
            </marker>
            <marker id="arrow-head-critical" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#ef4444" />
            </marker>
            <marker id="arrow-head-congested" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#f59e0b" />
            </marker>
          </defs>

          {/* Render Curved Edges */}
          {edges.map((edge) => {
            const src = nodeMap.get(edge.source);
            const tgt = nodeMap.get(edge.target);
            if (!src || !tgt) return null;

            const dx = tgt.x - src.x;
            const cx1 = src.x + dx * 0.5;
            const cy1 = src.y;
            const cx2 = src.x + dx * 0.5;
            const cy2 = tgt.y;
            const pathD = `M ${src.x} ${src.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tgt.x} ${tgt.y}`;

            const color = getEdgeColor(edge.status);
            const markerId = edge.status === 'critical' ? 'arrow-head-critical' : edge.status === 'congested' ? 'arrow-head-congested' : 'arrow-head-healthy';

            // Midpoint for metric badge
            const midX = (src.x + tgt.x) / 2;
            const midY = (src.y + tgt.y) / 2 - 10;

            return (
              <g key={edge.id}>
                {/* Background Shadow Line */}
                <path d={pathD} fill="none" stroke="#1e293b" strokeWidth="4" />
                {/* Flowing Animated Path */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={color}
                  strokeWidth={edge.status === 'critical' ? '2.5' : '2'}
                  strokeDasharray="6 4"
                  className="animate-pulse"
                  markerEnd={`url(#${markerId})`}
                  opacity={edge.status === 'critical' ? 1 : 0.75}
                />
                {/* Edge Metric Label */}
                <g transform={`translate(${midX}, ${midY})`}>
                  <rect x="-32" y="-9" width="64" height="18" rx="4" fill="#0b0f19" stroke={color} strokeWidth="1" opacity="0.9" />
                  <text x="0" y="3.5" textAnchor="middle" fontSize="9" fill="#e2e8f0" fontFamily="monospace">
                    {edge.latency_ms > 1000 ? `${(edge.latency_ms / 1000).toFixed(1)}s` : `${Math.round(edge.latency_ms)}ms`}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Render Nodes */}
          {nodes.map((node) => {
            const isBlast = blastRadius.includes(node.id);
            const colors = getStatusColor(node.status);
            const isSelected = selectedNode?.id === node.id;
            const isRoot = node.is_bottleneck;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => setSelectedNode(node)}
                className="cursor-pointer transition-transform duration-200 hover:scale-105"
              >
                {/* Blast Radius Radar Halo */}
                {isBlast && (
                  <circle
                    r="46"
                    fill="none"
                    stroke={colors.stroke}
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                    opacity="0.4"
                    className="animate-spin origin-center"
                    style={{ animationDuration: '8s' }}
                  />
                )}

                {/* Root Cause Bottleneck Halo */}
                {isRoot && (
                  <circle
                    r="40"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2"
                    opacity="0.6"
                    className="animate-ping"
                    style={{ animationDuration: '2s' }}
                  />
                )}

                {/* Node Body Card */}
                <rect
                  x="-75"
                  y="-26"
                  width="150"
                  height="52"
                  rx="10"
                  fill="#101522"
                  stroke={isSelected ? '#38bdf8' : colors.stroke}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  filter={isBlast ? 'url(#blast-glow)' : undefined}
                />

                {/* Node Status Dot */}
                <circle cx="-60" cy="0" r="5" fill={colors.stroke} />
                {node.status === 'critical' && (
                  <circle cx="-60" cy="0" r="8" fill="none" stroke="#ef4444" strokeWidth="1" className="animate-ping" />
                )}

                {/* Node Label */}
                <text x="-48" y="-6" fontSize="10.5" fontWeight="bold" fill="#f8fafc" fontFamily="sans-serif">
                  {node.name.length > 18 ? `${node.name.slice(0, 16)}...` : node.name}
                </text>

                {/* Secondary Metric Line */}
                <text x="-48" y="12" fontSize="9" fill="#94a3b8" fontFamily="monospace">
                  {node.rps > 0 ? `${node.rps} rps` : '0 rps'} | {node.error_rate_pct > 0 ? `${node.error_rate_pct.toFixed(1)}% err` : '0% err'}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Selected Node Mini Telemetry Flyout */}
        {selectedNode && (
          <div className="absolute top-3 right-3 w-64 bg-slate-900/95 border border-cyan-500/60 rounded-xl p-3 shadow-2xl backdrop-blur-md glow-cyan text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
              <div className="flex items-center gap-1.5 font-bold text-white">
                <Server className="w-3.5 h-3.5 text-cyan-400" />
                <span>{selectedNode.name}</span>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Health Status:</span>
                <span className={`font-bold uppercase ${getStatusColor(selectedNode.status).text}`}>
                  {selectedNode.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">P99 Latency:</span>
                <span className="text-slate-200">{selectedNode.latency_p99_ms.toFixed(1)}ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Error Rate:</span>
                <span className={selectedNode.error_rate_pct > 5 ? 'text-red-400 font-bold' : 'text-slate-200'}>
                  {selectedNode.error_rate_pct.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">CPU / RAM:</span>
                <span className="text-slate-200">{selectedNode.cpu_percent.toFixed(0)}% / {selectedNode.memory_percent.toFixed(0)}%</span>
              </div>
            </div>

            {selectedNode.active_alerts.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-800">
                <span className="text-[10px] text-red-400 font-mono block mb-1">Active Alerts:</span>
                <div className="space-y-0.5">
                  {selectedNode.active_alerts.map((a, i) => (
                    <div key={i} className="text-[10px] font-mono text-red-300 bg-red-950/40 p-1 rounded border border-red-900/50">
                      ⚠ {a}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            {onSendAction && selectedNode.id !== 'client-traffic' && (
              <div className="mt-3 pt-2 border-t border-slate-800 flex gap-1.5">
                <button
                  onClick={() => onSendAction(`Inspect logs for ${selectedNode.id}`)}
                  className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-mono transition"
                >
                  Inspect Logs
                </button>
                <button
                  onClick={() => onSendAction(`Restart pods for ${selectedNode.id}`)}
                  className="flex-1 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-mono font-bold transition"
                >
                  Restart Pods
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Nominal (&lt;50ms)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Congested</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span>Sev-1 Outage</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border border-dashed border-red-400" />
            <span>Blast Radius</span>
          </div>
        </div>

        <span className="font-mono text-[10px] text-slate-500">
          Click any node to inspect telemetry & logs
        </span>
      </div>
    </div>
  );
};

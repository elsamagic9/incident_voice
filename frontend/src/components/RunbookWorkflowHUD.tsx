import React from 'react';
import {
  ArrowRight, BookOpen, Check, Clock3, Database, Layers,
  Network, X, Mic, RefreshCw
} from 'lucide-react';
import type { ActiveRunbookSession } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface Props {
  activeRunbook: ActiveRunbookSession | null;
  onStartRunbook: (id: string) => void;
  onAdvanceRunbook: () => void;
  onAbortRunbook: () => void;
  disabled?: boolean;
}

const catalog = [
  {
    id: 'runbook-pg-pool',
    title: 'PostgreSQL Connection Exhaustion & Failover',
    description: 'Diagnose maxed connection pool, kill orphan zombie transactions, and fail over to read-replica.',
    time: '4 min',
    steps: 5,
    icon: Database,
    badge: 'High Severity'
  },
  {
    id: 'runbook-redis-eviction',
    title: 'Redis Cluster Memory Pressure & Eviction',
    description: 'Investigate cache memory usage spikes, release stale locks, and restart degraded workers.',
    time: '3 min',
    steps: 3,
    icon: Layers,
    badge: 'Performance'
  },
  {
    id: 'runbook-ingress-surge',
    title: 'Ingress 5xx Spike & Auto-Scaling Mitigation',
    description: 'Analyze Envoy gateway upstream timeouts and trigger horizontal pod autoscaling.',
    time: '3 min',
    steps: 3,
    icon: Network,
    badge: 'Traffic Ingress'
  },
];

export const RunbookWorkflowHUD: React.FC<Props> = ({
  activeRunbook: session,
  onStartRunbook,
  onAdvanceRunbook,
  onAbortRunbook,
  disabled,
}) => {
  if (!session || session.status !== 'active') {
    return (
      <div className="runbook-catalog space-y-4">
        {session?.status === 'completed' && (
          <div className="message-banner p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 flex items-center gap-2 text-xs">
            <Check size={16} className="text-emerald-400 shrink-0" />
            <p>
              Runbook successfully completed! All remediation steps executed and verified. Review remaining alerts.
            </p>
          </div>
        )}

        {session?.status === 'aborted' && (
          <div className="message-banner p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 flex items-center gap-2 text-xs">
            <X size={16} className="text-zinc-400 shrink-0" />
            <p>Runbook session aborted by operator. Select another SOP below to begin.</p>
          </div>
        )}

        <div className="py-1">
          <p className="text-xs text-zinc-400 leading-relaxed mb-4">
            Voice-guided Standard Operating Procedures (SOPs). The agent walks you through each diagnostic step,
            verifies telemetry before and after execution, and stages changes for voice authorization.
          </p>

          <div className="flex flex-col gap-3">
            {catalog.map(({ id, title, description, time, steps, icon: Icon, badge }) => (
              <Card
                key={id}
                className="runbook-option group p-4 border-zinc-800/80 bg-zinc-900/50 hover:bg-zinc-850 hover:border-cyan-500/40 transition-all duration-200 cursor-pointer flex items-start gap-3.5"
                onClick={() => !disabled && onStartRunbook(id)}
              >
                <div className="icon-tile w-10 h-10 rounded-xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform shrink-0">
                  <Icon size={20} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <strong className="text-slate-100 group-hover:text-cyan-300 transition-colors text-sm font-semibold">
                      {title}
                    </strong>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {badge}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-400 mb-2 leading-relaxed">{description}</p>
                  <div className="flex items-center gap-3 text-[11px] font-mono text-emerald-400">
                    <span className="flex items-center gap-1">
                      <Clock3 size={12} /> {time}
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span>{steps} verified steps</span>
                  </div>
                </div>

                <ArrowRight size={18} className="text-zinc-600 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all shrink-0 mt-2" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const step = session.steps[session.current_step_index];
  const complete = session.steps.filter(item => item.status === 'completed').length;
  const progressPct = Math.round((complete / session.total_steps) * 100);

  return (
    <div className="runbook-session space-y-4">
      <div className="runbook-session-heading flex items-center justify-between gap-2 flex-wrap">
        <Badge variant="cyan" className="flex items-center gap-1.5 font-mono text-xs py-1 px-2.5">
          <BookOpen size={13} />
          <span>Active SOP Workflow</span>
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="text-button text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 flex items-center gap-1 h-7 px-2"
          onClick={onAbortRunbook}
          disabled={disabled}
        >
          <X size={13} />
          <span>Abort runbook</span>
        </Button>
      </div>

      <h3 className="text-base font-semibold text-slate-100">{session.title}</h3>

      {/* Progress Bar & Counter */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-mono text-zinc-400">
          <span>Progress ({complete} of {session.total_steps} steps complete)</span>
          <span className="text-cyan-400 font-semibold">{progressPct}%</span>
        </div>
        <Progress value={progressPct} className="h-2 bg-zinc-800" indicatorClassName="bg-gradient-to-r from-cyan-500 to-emerald-500" />
      </div>

      {/* Steps List */}
      <ol className="runbook-steps space-y-2.5 mt-4">
        {session.steps.map((item, index) => {
          const isCurrent = index === session.current_step_index;
          const isDone = item.status === 'completed';
          const isFailed = item.status === 'failed';

          return (
            <li
              key={item.step_number}
              className={`p-3 rounded-lg border text-xs flex items-start gap-3 transition-all ${
                isCurrent
                  ? 'step-current bg-cyan-950/20 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                  : isDone
                  ? 'step-complete bg-zinc-900/40 border-zinc-800/80 text-zinc-400'
                  : 'bg-zinc-950/40 border-zinc-850 opacity-60 text-zinc-500'
              }`}
            >
              <span className={`step-number w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                isDone
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : isFailed
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : isCurrent
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                  : 'bg-zinc-800 text-zinc-400'
              }`}>
                {isDone ? (
                  <Check size={14} className="text-emerald-400 font-bold" />
                ) : isFailed ? (
                  <X size={14} className="text-rose-400" />
                ) : (
                  item.step_number
                )}
              </span>

              <div className="flex-1 min-w-0">
                <span className="font-medium text-slate-200 text-xs block">{item.title}</span>
                {isCurrent && (
                  <p className="text-zinc-300 text-xs mt-1 leading-relaxed">{item.description}</p>
                )}
                {isFailed && (
                  <p className="text-rose-400 text-xs mt-1 font-mono">{item.verification_result}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Action Footer */}
      <div className="runbook-next pt-3 border-t border-zinc-800 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <p className="text-zinc-400 flex items-center gap-1.5 m-0">
            <Mic size={13} className="text-cyan-400" />
            <span>Say “Next step” or click below</span>
          </p>
          <span className="font-mono text-cyan-300 text-xs">
            Step {session.current_step_index + 1} of {session.total_steps}
          </span>
        </div>

        <Button
          variant="cyan"
          className="button button-primary w-full flex items-center justify-center gap-2 font-semibold h-10"
          disabled={disabled}
          onClick={onAdvanceRunbook}
        >
          {step?.status === 'failed' ? (
            <>
              <RefreshCw size={15} />
              <span>Retry Step: {step?.title}</span>
            </>
          ) : (
            <>
              <span>Execute Step: {step?.title}</span>
              <ArrowRight size={15} />
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

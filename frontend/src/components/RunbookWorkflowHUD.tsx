import React from 'react';
import {
  ArrowRight, BookOpen, Check, Clock3, Database, Layers,
  Network, X, Mic, RefreshCw
} from 'lucide-react';
import type { ActiveRunbookSession } from '../types';

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
      <div className="runbook-catalog">
        {session?.status === 'completed' && (
          <div className="message-banner bg-emerald-950/40 border-emerald-500/40 text-emerald-200 mb-4">
            <Check size={18} className="text-emerald-400 shrink-0" />
            <p>
              Runbook successfully completed! All remediation steps executed and verified. Review remaining alerts.
            </p>
          </div>
        )}

        {session?.status === 'aborted' && (
          <div className="message-banner bg-slate-900 border-slate-700 text-slate-300 mb-4">
            <X size={18} className="text-slate-400 shrink-0" />
            <p>Runbook session aborted by operator. Select another SOP below to begin.</p>
          </div>
        )}

        <div className="py-2">
          <p className="text-xs text-slate-400 leading-relaxed mb-4">
            Voice-guided Standard Operating Procedures (SOPs). The agent walks you through each diagnostic step,
            verifies telemetry before and after execution, and stages changes for voice authorization.
          </p>

          <div className="flex flex-col gap-3">
            {catalog.map(({ id, title, description, time, steps, icon: Icon, badge }) => (
              <button
                className="runbook-option group p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 hover:bg-slate-850 hover:border-cyan-500/40 transition-all duration-200"
                key={id}
                disabled={disabled}
                onClick={() => onStartRunbook(id)}
              >
                <span className="icon-tile group-hover:scale-105 transition-transform shrink-0">
                  <Icon size={20} />
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-slate-100 group-hover:text-cyan-300 transition-colors text-sm font-semibold">
                      {title}
                    </strong>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                      {badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 mb-2.5 leading-relaxed">{description}</p>
                  <small className="flex items-center gap-3 text-[11px] font-mono text-emerald-400">
                    <span className="flex items-center gap-1">
                      <Clock3 size={12} /> {time}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span>{steps} verified steps</span>
                  </small>
                </div>

                <ArrowRight size={18} className="text-slate-600 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all shrink-0 mt-2" />
              </button>
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
    <div className="runbook-session">
      <div className="runbook-session-heading">
        <span className="status-tag status-info flex items-center gap-1.5 font-mono text-xs">
          <BookOpen size={13} />
          <span>Active SOP Workflow</span>
        </span>
        <button
          className="text-button text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
          onClick={onAbortRunbook}
          disabled={disabled}
        >
          <X size={13} />
          <span>Abort runbook</span>
        </button>
      </div>

      <h3 className="text-base font-semibold text-slate-100 mt-3">{session.title}</h3>

      {/* Progress Bar & Counter */}
      <div className="mt-3">
        <div className="flex justify-between text-xs font-mono text-slate-400 mb-1.5">
          <span>Progress ({complete} of {session.total_steps} steps complete)</span>
          <span className="text-cyan-400 font-semibold">{progressPct}%</span>
        </div>
        <div className="w-full h-2 bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/60">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(6,182,212,0.4)]"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Steps List */}
      <ol className="runbook-steps mt-4">
        {session.steps.map((item, index) => {
          const isCurrent = index === session.current_step_index;
          const isDone = item.status === 'completed';
          const isFailed = item.status === 'failed';

          return (
            <li
              key={item.step_number}
              className={`${
                isCurrent
                  ? 'step-current bg-cyan-950/20 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                  : isDone
                  ? 'step-complete'
                  : 'opacity-60'
              }`}
            >
              <span className="step-number">
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
                  <p className="text-slate-300 text-xs mt-1 leading-relaxed">{item.description}</p>
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
      <div className="runbook-next mt-4 pt-3 border-t border-slate-800">
        <div className="flex items-center justify-between mb-3 text-xs">
          <p className="text-slate-400 flex items-center gap-1.5 m-0">
            <Mic size={13} className="text-cyan-400" />
            <span>Say “Next step” or click below</span>
          </p>
          <span className="font-mono text-cyan-300 text-xs">
            Step {session.current_step_index + 1} of {session.total_steps}
          </span>
        </div>

        <button
          className="button button-primary w-full flex items-center justify-center gap-2 font-semibold"
          disabled={disabled}
          onClick={onAdvanceRunbook}
        >
          {step?.status === 'failed' ? (
            <>
              <RefreshCw size={16} />
              <span>Retry Step: {step?.title}</span>
            </>
          ) : (
            <>
              <span>Execute Step: {step?.title}</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

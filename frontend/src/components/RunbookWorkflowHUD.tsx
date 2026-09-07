import React, { useState } from 'react';
import {
  BookOpen, ChevronRight, CheckCircle2, Play, XCircle,
  ArrowRight, ShieldCheck, Database, Layers, Activity
} from 'lucide-react';
import { ActiveRunbookSession } from '../types';

interface Props {
  activeRunbook: ActiveRunbookSession | null;
  onStartRunbook: (runbookId: string) => void;
  onAdvanceRunbook: () => void;
  onAbortRunbook: () => void;
}

export const RunbookWorkflowHUD: React.FC<Props> = ({
  activeRunbook,
  onStartRunbook,
  onAdvanceRunbook,
  onAbortRunbook
}) => {
  const [showCatalog, setShowCatalog] = useState(false);

  const availableRunbooks = [
    {
      id: 'runbook-pg-pool',
      title: 'PostgreSQL Pool Starvation & Failover',
      category: 'Database Infrastructure',
      severity: 'SEV-1',
      stepsCount: 5,
      icon: Database
    },
    {
      id: 'runbook-redis-eviction',
      title: 'Redis Eviction Pressure & Lock Triage',
      category: 'Caching Layer',
      severity: 'SEV-2',
      stepsCount: 3,
      icon: Layers
    },
    {
      id: 'runbook-ingress-surge',
      title: 'Ingress Traffic Surge & Autoscaler Throttling',
      category: 'Network & Ingress',
      severity: 'SEV-2',
      stepsCount: 3,
      icon: Activity
    }
  ];

  if (activeRunbook && activeRunbook.status === 'completed') {
    return (
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 border border-emerald-500/60 rounded-xl p-4 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 glow-emerald">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700">
                RUNBOOK COMPLETED & TELEMETRY VERIFIED
              </span>
              <h3 className="text-xs font-bold text-white tracking-wide">
                {activeRunbook.title}
              </h3>
            </div>
            <p className="text-[11px] text-emerald-200/90 font-mono mt-0.5">
              All {activeRunbook.total_steps} operational procedures were executed and telemetry gates verified. Cluster nominal.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onStartRunbook('runbook-redis-eviction')}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
          >
            Run Redis Runbook
          </button>
          <button
            onClick={() => onStartRunbook('runbook-pg-pool')}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-600/30 transition"
          >
            Re-run PgPool Runbook
          </button>
        </div>
      </div>
    );
  }

  if (!activeRunbook || activeRunbook.status !== 'active') {
    return (
      <div className="bg-[#101522]/90 border border-slate-800 rounded-xl p-3 px-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-white tracking-wide uppercase">
                Interactive SRE Runbook Workflow Engine
              </h4>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                Voice Guided SOPs
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Autonomous multi-step remediation with automated telemetry gates at each phase.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => setShowCatalog(!showCatalog)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>{showCatalog ? 'Close Catalog' : 'Select Runbook'}</span>
          </button>
          <button
            onClick={() => onStartRunbook('runbook-pg-pool')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-600/30 transition"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Launch PgPool Runbook</span>
          </button>
        </div>

        {showCatalog && (
          <div className="w-full pt-3 mt-1 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {availableRunbooks.map((rb) => {
              const IconComp = rb.icon;
              return (
                <div
                  key={rb.id}
                  onClick={() => {
                    onStartRunbook(rb.id);
                    setShowCatalog(false);
                  }}
                  className="bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-cyan-500/50 p-3 rounded-lg cursor-pointer transition flex items-start justify-between gap-2 group"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded bg-slate-800 text-cyan-400 group-hover:bg-cyan-500/20 transition">
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-cyan-400 block">{rb.category}</span>
                      <h5 className="text-xs font-bold text-slate-200 group-hover:text-white transition leading-snug">
                        {rb.title}
                      </h5>
                      <span className="text-[10px] text-slate-400 mt-0.5 block font-mono">
                        {rb.stepsCount} verified steps
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition shrink-0 mt-1" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Active Runbook In-Progress View
  const currentStep = activeRunbook.steps[activeRunbook.current_step_index] || activeRunbook.steps[0];
  const stepIdx = activeRunbook.current_step_index;

  return (
    <div className="bg-gradient-to-r from-slate-900 via-[#101522] to-slate-900 border border-cyan-500/50 rounded-xl p-4 shadow-2xl flex flex-col gap-3 glow-cyan">
      {/* Top Meta Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 animate-pulse">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                ACTIVE SRE RUNBOOK
              </span>
              <h3 className="text-xs font-bold text-white tracking-wide">
                {activeRunbook.title}
              </h3>
            </div>
            <p className="text-[11px] text-slate-300 font-mono mt-0.5">
              Target: <span className="text-cyan-300">{currentStep.target_service}</span> | Voice-guided execution with live metric gates
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={onAbortRunbook}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-red-950/40 text-slate-300 hover:text-red-300 border border-slate-700 hover:border-red-500/40 text-xs font-semibold transition"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Abort Runbook</span>
          </button>
          <button
            onClick={onAdvanceRunbook}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow-lg shadow-cyan-500/30 transition animate-bounce"
          >
            <span>Execute & Next Step</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stepper Progression Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {activeRunbook.steps.map((step, idx) => {
          const isDone = step.status === 'completed';
          const isCurrent = idx === stepIdx;
          return (
            <div
              key={step.step_number}
              className={`p-2 rounded-lg border text-xs transition flex items-center gap-2 ${
                isCurrent
                  ? 'bg-cyan-950/60 border-cyan-400 text-cyan-200 shadow-md ring-1 ring-cyan-400/50'
                  : isDone
                  ? 'bg-slate-900/60 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900/40 border-slate-800 text-slate-500'
              }`}
            >
              <div className="shrink-0">
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : isCurrent ? (
                  <div className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-slate-800 text-[10px] font-mono flex items-center justify-center text-slate-400">
                    {step.step_number}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-mono uppercase block text-slate-400">
                  Step {step.step_number}
                </span>
                <span className="font-semibold truncate block text-[11px] leading-tight text-white">
                  {step.title}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Current Step Focus Box */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700 font-mono font-bold">
              CURRENT STEP {stepIdx + 1}/{activeRunbook.total_steps}
            </span>
            <h4 className="text-xs font-bold text-white">{currentStep.title}</h4>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{currentStep.description}</p>
          <div className="flex items-center gap-3 pt-1 text-[11px] font-mono">
            <span className="text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              Telemetry Gate: <strong className="text-cyan-200">{currentStep.verification_metric || 'Zero active errors'}</strong>
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">
              Voice command: <span className="text-amber-300 italic">&ldquo;Next step&rdquo;</span> or <span className="text-amber-300 italic">&ldquo;Execute step&rdquo;</span>
            </span>
          </div>
        </div>

        <button
          onClick={onAdvanceRunbook}
          className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Execute Step {stepIdx + 1}</span>
        </button>
      </div>
    </div>
  );
};

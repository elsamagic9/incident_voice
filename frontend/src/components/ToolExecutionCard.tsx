import React, { useState } from 'react';
import { Check, ChevronDown, Clock3, FileText, Wrench, X, Copy, Terminal } from 'lucide-react';
import type { ToolExecution } from '../types';

export const ToolExecutionCard: React.FC<{ tool: ToolExecution }> = ({ tool }) => {
  const [copied, setCopied] = useState(false);

  const failed = !!tool.result.error || tool.result.success === false || ['error', 'denied'].includes(tool.result.status);
  const staged = tool.result.status === 'staged';
  const draft = tool.result.status === 'draft';
  const label = failed ? 'Failed' : staged ? 'Needs Approval' : draft ? 'Draft' : 'Executed';
  const Icon = failed ? X : staged ? Clock3 : draft ? FileText : Check;
  const summary = tool.result.error || tool.result.message || tool.result.spoken || tool.result.confirmation;

  const copyJson = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(JSON.stringify({ tool: tool.tool_name, arguments: tool.arguments, result: tool.result }, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <details className="tool-card group border border-slate-800/80 bg-slate-900/60 rounded-xl overflow-hidden transition-all duration-200 hover:border-slate-700">
      <summary className="list-none flex items-center gap-3 p-3 cursor-pointer select-none hover:bg-slate-800/40">
        <span className="tool-icon p-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-400">
          <Wrench size={14} />
        </span>

        <span className="tool-card-name flex-1 min-w-0">
          <span className="font-mono text-xs font-semibold text-slate-200 block truncate">
            {tool.tool_name.replace(/_/g, ' ')}
          </span>
          <small className="font-mono text-[10px] text-slate-400 block truncate">
            target: {tool.arguments.service_name ?? 'cluster-orchestrator'}
          </small>
        </span>

        <span
          className={`tool-status flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider border ${
            failed
              ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
              : staged
              ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
              : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
          }`}
        >
          <Icon size={11} className={staged ? 'animate-pulse' : ''} />
          <span>{label}</span>
        </span>

        <ChevronDown size={14} className="details-chevron text-slate-500 transition-transform duration-200 group-open:rotate-180" />
      </summary>

      <div className="tool-details p-4 border-t border-slate-800/80 bg-slate-950/80">
        {typeof summary === 'string' && (
          <div className="mb-3 p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-300 leading-relaxed font-mono">
            {summary}
          </div>
        )}

        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 m-0 flex items-center gap-1">
            <Terminal size={11} /> Parameters & Telemetry Result
          </h4>
          <button
            type="button"
            onClick={copyJson}
            className="text-[10px] font-mono text-slate-400 hover:text-cyan-300 flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 transition-colors"
          >
            <Copy size={10} />
            <span>{copied ? 'Copied' : 'Copy JSON'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          <div>
            <span className="text-[9px] font-mono text-slate-500 block mb-1">ARGUMENTS</span>
            <pre className="text-[10px] font-mono p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-cyan-300 overflow-x-auto m-0 max-h-40">
              {JSON.stringify(tool.arguments, null, 2)}
            </pre>
          </div>
          <div>
            <span className="text-[9px] font-mono text-slate-500 block mb-1">PAYLOAD RESPONSE</span>
            <pre className="text-[10px] font-mono p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-emerald-300 overflow-x-auto m-0 max-h-40">
              {JSON.stringify(tool.result, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </details>
  );
};

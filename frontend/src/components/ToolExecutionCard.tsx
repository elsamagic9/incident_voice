import React, { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Wrench, X, Terminal } from 'lucide-react';
import { ToolExecution } from '../types';

interface Props {
  tool: ToolExecution;
}

export const ToolExecutionCard: React.FC<Props> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);

  const getActionBadge = () => {
    if (tool.tool_name === 'execute_remediation') {
      return (
        <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold shadow-sm glow-green">
          ACTION EXECUTED
        </span>
      );
    }
    if (tool.tool_name === 'trigger_pager') {
      return (
        <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 font-semibold shadow-sm glow-red">
          PAGER ALERT
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold">
        TELEMETRY QUERY
      </span>
    );
  };

  return (
    <div className="glass-panel-subtle rounded-xl border border-white/[0.08] overflow-hidden text-xs font-mono shadow-md transition-all hover:border-white/20">
      <div
        onClick={() => setExpanded(!expanded)}
        className="px-3.5 py-2.5 flex items-center justify-between cursor-pointer hover:bg-white/[0.03] transition"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Wrench className="w-3.5 h-3.5" />
          </div>
          <span className="text-slate-200 font-bold">{tool.tool_name}</span>
          {getActionBadge()}
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          {tool.result.error || tool.result.status === 'error' ? (
            <span className="text-[10px] flex items-center gap-1 text-red-400 font-semibold">
              <X className="w-3 h-3" /> error
            </span>
          ) : (
            <span className="text-[10px] flex items-center gap-1 text-emerald-400 font-semibold">
              <Check className="w-3 h-3" /> success
            </span>
          )}
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </div>

      {expanded && (
        <div className="p-3.5 border-t border-white/[0.06] bg-slate-950/80 space-y-2.5 backdrop-blur-md">
          {/* Arguments */}
          {Object.keys(tool.arguments).length > 0 && (
            <div>
              <span className="text-slate-400 text-[10px] block mb-1 font-bold flex items-center gap-1">
                <Terminal className="w-3 h-3 text-cyan-400" />
                INPUT ARGUMENTS:
              </span>
              <pre className="text-cyan-300 bg-slate-950 p-2.5 rounded-xl border border-white/[0.06] overflow-x-auto text-[11px] leading-relaxed shadow-inner">
                {JSON.stringify(tool.arguments, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          <div>
            <span className="text-slate-400 text-[10px] block mb-1 font-bold flex items-center gap-1">
              <Terminal className="w-3 h-3 text-emerald-400" />
              OUTPUT RESULT:
            </span>
            <pre className="text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-white/[0.06] overflow-x-auto max-h-48 text-[11px] leading-relaxed shadow-inner">
              {JSON.stringify(tool.result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

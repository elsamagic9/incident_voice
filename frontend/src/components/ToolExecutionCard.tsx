import React, { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Wrench } from 'lucide-react';
import { ToolExecution } from '../types';

interface Props {
  tool: ToolExecution;
}

export const ToolExecutionCard: React.FC<Props> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);

  const getActionBadge = () => {
    if (tool.tool_name === 'execute_remediation') {
      return (
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
          ACTION EXECUTED
        </span>
      );
    }
    if (tool.tool_name === 'trigger_pager') {
      return (
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40">
          PAGER ALERT
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
        TELEMETRY QUERY
      </span>
    );
  };

  return (
    <div className="bg-slate-900/90 rounded-lg border border-slate-800 overflow-hidden text-xs font-mono shadow-md">
      <div
        onClick={() => setExpanded(!expanded)}
        className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-800/60 transition"
      >
        <div className="flex items-center gap-2">
          <Wrench className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-200 font-semibold">{tool.tool_name}</span>
          {getActionBadge()}
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <span className="text-[10px] flex items-center gap-1 text-emerald-400">
            <Check className="w-3 h-3" /> success
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </div>

      {expanded && (
        <div className="p-3 border-t border-slate-800 bg-black/40 space-y-2">
          {/* Arguments */}
          {Object.keys(tool.arguments).length > 0 && (
            <div>
              <span className="text-slate-500 text-[10px] block mb-0.5">INPUT ARGUMENTS:</span>
              <pre className="text-cyan-300 bg-slate-950 p-2 rounded border border-slate-800/80 overflow-x-auto">
                {JSON.stringify(tool.arguments, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          <div>
            <span className="text-slate-500 text-[10px] block mb-0.5">OUTPUT RESULT:</span>
            <pre className="text-slate-300 bg-slate-950 p-2 rounded border border-slate-800/80 overflow-x-auto max-h-40">
              {JSON.stringify(tool.result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

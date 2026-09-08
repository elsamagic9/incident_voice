import React from 'react';
import { History, Bell, Mic, Terminal, ShieldCheck } from 'lucide-react';
import { IncidentRecord } from '../types';

interface Props {
  incident: IncidentRecord | null;
}

export const IncidentTimeline: React.FC<Props> = ({ incident }) => {
  const events = incident?.timeline_events || [];

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'alert':
        return <Bell className="w-3.5 h-3.5 text-red-400 drop-shadow-[0_0_6px_#ef4444]" />;
      case 'voice':
        return <Mic className="w-3.5 h-3.5 text-cyan-400 drop-shadow-[0_0_6px_#06b6d4]" />;
      case 'action':
        return <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 drop-shadow-[0_0_6px_#10b981]" />;
      default:
        return <Terminal className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="glass-panel rounded-2xl border border-white/[0.08] p-4 shadow-xl flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-sans">
            Incident Event Log
          </h3>
        </div>
        <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded-full font-semibold">
          {events.length} events logged
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
        {events.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs font-mono py-6">
            <History className="w-6 h-6 text-slate-600 mb-1" />
            <span>No incident events logged yet.</span>
          </div>
        )}
        {events.map((evt, idx) => {
          const timeStr = new Date(evt.timestamp * 1000).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          return (
            <div
              key={idx}
              className="glass-panel-subtle p-2.5 rounded-xl border border-white/[0.06] flex items-start gap-2.5 transition hover:border-white/20"
            >
              <div className="mt-0.5 p-1.5 rounded-lg bg-slate-900/90 border border-white/[0.06] flex-shrink-0">
                {getEventIcon(evt.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-0.5">
                  <span className="uppercase font-bold text-slate-300 tracking-wider">{evt.type}</span>
                  <span className="text-slate-500">{timeStr}</span>
                </div>
                <p className="text-slate-200 leading-snug break-words font-sans text-xs">{evt.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

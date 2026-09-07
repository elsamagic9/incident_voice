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
        return <Bell className="w-3.5 h-3.5 text-red-400" />;
      case 'voice':
        return <Mic className="w-3.5 h-3.5 text-cyan-400" />;
      case 'action':
        return <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Terminal className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="bg-[#101522] rounded-xl border border-slate-800 p-4 shadow-xl flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Incident Event Log</h3>
        </div>
        <span className="text-[10px] font-mono text-slate-400">{events.length} events logged</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs">
        {events.length === 0 && (
          <p className="text-slate-500 text-center py-6">No incident events logged yet.</p>
        )}
        {events.map((evt, idx) => {
          const timeStr = new Date(evt.timestamp * 1000).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          return (
            <div key={idx} className="flex items-start gap-2.5 bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
              <div className="mt-0.5 p-1 rounded bg-slate-800 flex-shrink-0">
                {getEventIcon(evt.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-0.5">
                  <span className="uppercase font-semibold text-slate-400">{evt.type}</span>
                  <span>{timeStr}</span>
                </div>
                <p className="text-slate-200 leading-snug break-words">{evt.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

import React from 'react';
import { Bell, Check, History, MessageSquare } from 'lucide-react';
import type { IncidentRecord } from '../types';

export const IncidentTimeline: React.FC<{ incident: IncidentRecord | null }> = ({ incident }) => {
  const events = [...(incident?.timeline_events ?? [])].reverse();
  if (!events.length) return <div className="compact-empty"><History size={20} /><div><h3>A timeline you can follow</h3><p>Incident events will appear here, newest first.</p></div></div>;
  return <ol className="timeline-list">{events.map((event, index) => <li key={`${event.timestamp}-${index}`}><span className={`timeline-icon ${event.type === 'alert' ? 'text-amber-300' : ''}`}>{event.type === 'alert' ? <Bell size={13} /> : event.type === 'action' ? <Check size={13} /> : <MessageSquare size={13} />}</span><div><time>{new Date(event.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><p>{event.text}</p></div></li>)}</ol>;
};

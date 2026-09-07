export type AgentStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted' | 'awaiting_confirmation' | 'error';

export type VoiceEngine = 'voice_agent_api' | 'custom_stt_v3';

export interface ServiceNode {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'critical';
  replicas: number;
  cpu_percent: number;
  memory_percent: number;
  error_rate_pct: number;
  latency_p99_ms: number;
  active_alerts: string[];
  recent_logs: string[];
}

export interface TimelineEvent {
  timestamp: number;
  type: 'alert' | 'system' | 'voice' | 'action' | 'pager';
  text: string;
}

export interface IncidentRecord {
  id: string;
  title: string;
  severity: 'SEV-1' | 'SEV-2' | 'SEV-3';
  status: 'INVESTIGATING' | 'IDENTIFIED' | 'MITIGATING' | 'RESOLVED';
  started_at: number;
  resolved_at?: number | null;
  timeline_events: TimelineEvent[];
  mitigations_applied: string[];
}

export interface Turn {
  id: string;
  speaker: 'user' | 'agent' | 'system';
  transcript: string;
  end_of_turn: boolean;
  confidence?: number | null;
  timestamp: number;
}

export interface ToolExecution {
  id: string;
  tool_name: string;
  arguments: Record<string, any>;
  result: Record<string, any>;
  timestamp: number;
}

export interface ActionItemTicket {
  id: string;
  title: string;
  priority: 'P0' | 'P1' | 'P2';
  owner_team: string;
  component?: string;
  description: string;
}

export interface StagedRemediation {
  action: string;
  service_name: string;
  params?: Record<string, any>;
  staged_at?: number;
  message?: string;
}

export interface PostMortemData {
  incident_id: string;
  title: string;
  severity: string;
  mttd_minutes: number;
  mttr_minutes: number;
  executive_summary: string;
  root_cause: string;
  timeline: { time: string; event: string; type: string }[];
  actions_taken: string[];
  preventive_action_items: { action: string; owner_team: string; priority: string }[];
  markdown_report: string;
  action_items_tickets?: ActionItemTicket[];
  slack_briefing?: string;
}

export type AgentStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted' | 'awaiting_confirmation' | 'error';

export type VoiceEngine = 'voice_agent_api' | 'custom_stt_v3';

export interface ServiceNode {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  metrics_available?: boolean;
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
  severity: 'SEV-1' | 'SEV-2' | 'SEV-3' | 'UNASSESSED';
  status: 'INVESTIGATING' | 'IDENTIFIED' | 'MITIGATING' | 'MITIGATED' | 'RESOLVED';
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
  id?: string;
  expires_at?: number;
  simulated?: boolean;
  action: string;
  service_name: string;
  params?: Record<string, any>;
  challenge_code?: string;
  staged_at?: number;
  message?: string;
  hardware_mfa_required?: boolean;
}

export interface PostMortemData {
  source?: string;
  generation_warning?: string;
  infrastructure_mode?: string;
  incident_status?: string;
  incident_id: string;
  title: string;
  severity: string;
  mttd_minutes: number | null;
  mttr_minutes: number | null;
  executive_summary: string;
  root_cause: string;
  timeline: { time: string; event: string; type: string }[];
  actions_taken: string[];
  preventive_action_items: { action: string; owner_team: string; priority: string }[];
  markdown_report: string;
  action_items_tickets?: ActionItemTicket[];
  slack_briefing?: string;
}

// =============================================================================
// Feature 1: SRE Runbook Workflow Engine Types
// =============================================================================
export interface RunbookStep {
  step_number: number;
  title: string;
  description: string;
  command_hint: string;
  target_service: string;
  action?: string | null;
  action_args?: Record<string, any>;
  verification_metric?: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  verification_result?: string | null;
}

export interface RunbookDefinition {
  id: string;
  title: string;
  category: string;
  severity: string;
  estimated_minutes: number;
  description: string;
  steps: RunbookStep[];
}

export interface ActiveRunbookSession {
  runbook_id: string;
  title: string;
  current_step_index: number;
  total_steps: number;
  started_at: number;
  completed_at?: number | null;
  status: 'active' | 'completed' | 'aborted';
  steps: RunbookStep[];
}

// =============================================================================
// Feature 2: Service Dependency Graph / Topology Map Types
// =============================================================================
export interface TopologyNode {
  id: string;
  name: string;
  type: 'client' | 'gateway' | 'service' | 'database' | 'cache';
  status: 'healthy' | 'degraded' | 'critical';
  rps: number;
  latency_p99_ms: number;
  cpu_percent: number;
  memory_percent: number;
  error_rate_pct: number;
  is_blast_radius: boolean;
  is_bottleneck: boolean;
  active_alerts: string[];
  x: number;
  y: number;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  rps: number;
  latency_ms: number;
  status: 'healthy' | 'congested' | 'critical';
  error_rate_pct: number;
  protocol: string;
}

export interface ServiceTopology {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  blast_radius_service_ids: string[];
  root_cause_service_id?: string | null;
  cascading_failure_active: boolean;
  total_cluster_rps: number;
}

// =============================================================================
// Feature 3: Acoustic Incident Black Box / Flight Recorder Types
// =============================================================================
export interface BlackBoxMarker {
  id: string;
  time_seconds: number;
  time_label: string;
  speaker: 'system' | 'user' | 'agent' | 'alert';
  transcript: string;
  event_type: string;
  is_key_milestone: boolean;
}

export interface BlackBoxSession {
  incident_id: string;
  total_duration_seconds: number;
  audio_url: string | null;
  recorded_tracks?: string[];
  recording_limited?: boolean;
  audio_data_uri?: string | null;
  waveform_peaks: number[];
  markers: BlackBoxMarker[];
}

// =============================================================================
// Enterprise 9.5/10: SOC-2 Cryptographic Audit Ledger Types
// =============================================================================
export interface AuditLedgerEntry {
  block_index: number;
  timestamp_iso: string;
  actor: string;
  role: string;
  event_type: string;
  action: string;
  details: Record<string, any>;
  prev_hash: string;
  block_hash: string;
}

export interface AuditManifest {
  compliance_certification: string;
  chain_status: string;
  total_cryptographic_blocks: number;
  merkle_leaf_root_hash: string;
  audit_timestamp: string;
  failure_details?: string | null;
  blocks: AuditLedgerEntry[];
}

from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field

# WebSocket message wrappers
class WSClientMessage(BaseModel):
    type: str  # "audio_chunk", "command", "barge_in", "reset"
    data: Optional[str] = None  # Base64 or text
    command: Optional[str] = None

class TurnMessage(BaseModel):
    type: str = "turn"
    speaker: str  # "user", "agent", "system"
    transcript: str
    end_of_turn: bool = False
    confidence: Optional[float] = None
    timestamp: float = Field(default_factory=float)

class ToolExecutionEvent(BaseModel):
    type: str = "tool_executed"
    tool_name: str
    arguments: Dict[str, Any]
    result: Dict[str, Any]
    timestamp: float = Field(default_factory=float)

class AgentStateEvent(BaseModel):
    type: str = "agent_state"
    state: str  # "listening", "thinking", "executing_tool", "speaking", "interrupted"

class ClusterSyncEvent(BaseModel):
    type: str = "cluster_sync"
    incident: Dict[str, Any]
    services: Dict[str, Any]

class PostMortemReport(BaseModel):
    incident_id: str
    title: str
    severity: str
    mttd_minutes: float
    mttr_minutes: float
    executive_summary: str
    root_cause: str
    timeline: List[Dict[str, Any]]
    actions_taken: List[str]
    preventive_action_items: List[Dict[str, str]]
    markdown_report: str
    action_items_tickets: Optional[List[Dict[str, Any]]] = None
    slack_briefing: Optional[str] = None

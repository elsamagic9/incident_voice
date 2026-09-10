import os
from typing import List, Union, Literal
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # AssemblyAI Configuration
    assemblyai_api_key: str = ""
    assemblyai_streaming_url: str = (
        "wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=universal-3-5-pro&format_turns=true&end_of_turn_confidence_threshold=0.6"
    )
    assemblyai_voice_agent_url: str = "wss://agents.assemblyai.com/v1/ws"
    default_engine: str = "custom_stt_v3"  # "voice_agent_api" (Path 1) or "custom_stt_v3" (Path 2)

    # LLM Settings
    llm_provider: Literal["gemini", "openai", "mock"] = "gemini"
    gemini_model: str = "gemini-3.5-flash"
    openai_model: str = "gpt-4o-mini"
    lemur_model: str = "anthropic/claude-3-5-sonnet"
    voice_agent_voice: str = "marius"
    gemini_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    # TTS Settings
    tts_provider: Literal["edge-tts", "browser"] = "edge-tts"
    cartesia_api_key: str = ""
    elevenlabs_api_key: str = ""
    edge_tts_voice: str = "en-US-ChristopherNeural"

    # Server Settings
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    infrastructure_mode: Literal["simulation", "docker", "kubernetes"] = "simulation"
    operator_access_token: str = ""
    cookie_secure: bool = False
    docker_targets: dict[str, str] = {"payment-service": "incident-payment", "order-db": "incident-order-db", "redis-cache": "incident-redis"}
    kubernetes_namespace: str = "production"
    allowed_origins: Union[List[str], str] = [
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000"
    ]

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, v):
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @field_validator("assemblyai_api_key", "gemini_api_key", "openai_api_key", mode="before")
    @classmethod
    def normalize_provider_key(cls, value):
        value = str(value or "").strip()
        if value.lower().startswith(("your_", "your-", "replace_me", "changeme")):
            return ""
        return value

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), "../../../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

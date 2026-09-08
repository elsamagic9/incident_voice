import os
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # AssemblyAI Configuration
    assemblyai_api_key: str = ""
    assemblyai_streaming_url: str = (
        "wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=universal-3-5-pro&format_turns=true"
    )
    assemblyai_voice_agent_url: str = "wss://agents.assemblyai.com/v1/ws"
    default_engine: str = "custom_stt_v3"  # "voice_agent_api" (Path 1) or "custom_stt_v3" (Path 2)

    # LLM Settings
    llm_provider: str = "gemini"  # "gemini", "openai", "claude", "mock"
    gemini_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    # TTS Settings
    tts_provider: str = "edge-tts"  # "cartesia", "elevenlabs", "edge-tts", "browser"
    cartesia_api_key: str = ""
    elevenlabs_api_key: str = ""
    edge_tts_voice: str = "en-US-ChristopherNeural"

    # Server Settings
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    allowed_origins: Union[List[str], str] = [
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
        "*"
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

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), "../../../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

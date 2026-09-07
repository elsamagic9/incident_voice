#!/usr/bin/env python3
"""
IncidentVoice: AssemblyAI Streaming v3 Diagnostic Tool
Tests WebSocket handshake and authentication with AssemblyAI.
"""

import asyncio
import os
import sys
import websockets
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

API_KEY = os.getenv("ASSEMBLYAI_API_KEY", "")

async def test_connection():
    print("==================================================")
    print("🔍 Testing AssemblyAI Streaming v3 WebSocket")
    print("==================================================")

    if not API_KEY or API_KEY == "your_assemblyai_api_key_here":
        print("❌ Error: ASSEMBLYAI_API_KEY is not configured in .env")
        print("   Please set your key in .env or pass as environment variable.")
        sys.exit(1)

    url = (
        "wss://streaming.assemblyai.com/v3/ws"
        "?sample_rate=16000"
        "&speech_model=universal-3-5-pro"
        "&format_turns=true"
    )
    headers = {"Authorization": API_KEY.strip()}

    print(f"Connecting to: {url[:55]}...")
    try:
        async with websockets.connect(url, additional_headers=headers, timeout=10) as ws:
            print("✅ WebSocket connection successfully established!")
            print("Waiting for SessionBegins event...")
            msg = await asyncio.wait_for(ws.recv(), timeout=10)
            print(f"✅ Received response from AssemblyAI: {msg}")
            print("\n🎉 Connection Verified! AssemblyAI Streaming v3 is ready to receive audio.")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(test_connection())

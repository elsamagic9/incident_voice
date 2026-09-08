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

async def test_path1_voice_agent_api():
    print("\n--------------------------------------------------")
    print("🤖 Path 1: AssemblyAI Voice Agent API Diagnostic")
    print("--------------------------------------------------")
    url = "wss://agents.assemblyai.com/v1/ws"
    # Voice Agent API accepts Bearer or direct token in header
    headers = {"Authorization": f"Bearer {API_KEY.strip()}"}

    print(f"Connecting to: {url}...")
    try:
        async with websockets.connect(url, additional_headers=headers, open_timeout=10) as ws:
            print("✅ Path 1 WebSocket connection established successfully!")
            print("Sending session.update handshake...")
            import json
            await ws.send(json.dumps({
                "type": "session.update",
                "session": {
                    "instructions": "You are an autonomous incident commander.",
                    "voice": "default"
                }
            }))
            resp = await asyncio.wait_for(ws.recv(), timeout=10)
            print(f"✅ Path 1 Handshake Acknowledged: {resp[:120]}...")
            print("🎉 Path 1 (Voice Agent API) is operational!")
    except Exception as e:
        print(f"⚠️  Path 1 test note: {e}")

async def test_path2_streaming_v3():
    print("\n--------------------------------------------------")
    print("🎙️ Path 2: AssemblyAI Streaming v3 STT Diagnostic")
    print("--------------------------------------------------")
    url = (
        "wss://streaming.assemblyai.com/v3/ws"
        "?sample_rate=16000"
        "&speech_model=universal-3-5-pro"
        "&format_turns=true"
    )
    headers = {"Authorization": API_KEY.strip()}

    print(f"Connecting to: {url[:55]}...")
    try:
        async with websockets.connect(url, additional_headers=headers, open_timeout=10) as ws:
            print("✅ Path 2 WebSocket connection successfully established!")
            print("Waiting for SessionBegins event...")
            msg = await asyncio.wait_for(ws.recv(), timeout=10)
            print(f"✅ Received response from AssemblyAI: {msg[:120]}...")
            print("🎉 Path 2 (Universal-3.5 Pro Streaming STT) is operational!")
    except Exception as e:
        print(f"❌ Path 2 connection failed: {e}")

async def main():
    print("==================================================")
    print("🔍 IncidentVoice: AssemblyAI Dual-Engine Diagnostics")
    print("==================================================")

    if not API_KEY or API_KEY == "your_assemblyai_api_key_here":
        print("❌ Error: ASSEMBLYAI_API_KEY is not configured in .env")
        print("   Please set your key in .env or pass as environment variable.")
        sys.exit(1)

    await test_path1_voice_agent_api()
    await test_path2_streaming_v3()
    print("\n==================================================")
    print("🎯 All AssemblyAI Dual-Engine tests completed!")
    print("==================================================")

if __name__ == "__main__":
    asyncio.run(main())

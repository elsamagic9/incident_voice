#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

echo "=========================================================="
echo "🚀 Starting IncidentVoice: Autonomous Voice SRE Commander"
echo "   AssemblyAI Voice Agent Hackathon (lablab.ai)"
echo "=========================================================="

# Check if .env exists, if not copy from .env.example
if [ ! -f "$DIR/.env" ]; then
    echo "⚠️  No .env found. Copying .env.example -> .env"
    cp "$DIR/.env.example" "$DIR/.env"
fi

# 1. Start backend in background
echo "⚡ Starting Python FastAPI Backend on http://127.0.0.1:8000 ..."
cd "$DIR/backend"
if [ ! -d ".venv" ]; then
    echo "📦 Initializing virtual environment..."
    uv venv
    uv pip install -r requirements.txt
fi

source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

cleanup() {
    echo "🛑 Shutting down IncidentVoice services..."
    kill $BACKEND_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# 2. Start frontend dev server
echo "🎨 Starting Vite Frontend on http://127.0.0.1:5173 ..."
cd "$DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ IncidentVoice Mission Control is online!"
echo "   • Mission Control HUD: http://localhost:5173"
echo "   • Backend API Docs:    http://localhost:8000/docs"
echo "   • Voice WebSocket:     ws://localhost:8000/ws/agent"
echo ""
echo "Press Ctrl+C to stop both servers."

wait

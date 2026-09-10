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
    python3 -m venv .venv
fi

source .venv/bin/activate
if [ -f "requirements.txt" ] && python -m pip --version &>/dev/null; then
    python -m pip install -r requirements.txt
fi
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

cleanup() {
    echo "🛑 Shutting down IncidentVoice services..."
    kill $BACKEND_PID 2>/dev/null || true
    if [ -n "${FRONTEND_PID:-}" ]; then kill "$FRONTEND_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 0' SIGINT SIGTERM

# 2. Start frontend dev server
echo "🎨 Starting Vite Frontend on http://127.0.0.1:5173 ..."
cd "$DIR/frontend"
npm ci
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ IncidentVoice Mission Control is online!"
echo "   • Mission Control HUD: http://localhost:5173"
echo "   • Backend API Docs:    http://localhost:8000/docs"
echo "   • Voice WebSocket:     ws://localhost:8000/ws/agent"
echo ""
echo "Press Ctrl+C to stop both servers."

wait -n "$BACKEND_PID" "$FRONTEND_PID"

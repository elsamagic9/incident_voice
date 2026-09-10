#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR/infrastructure"

echo "=========================================================="
echo "🐳 Launching Real Docker SRE Sandbox Containers..."
echo "=========================================================="

docker compose up -d

echo "✅ Real microservices active:"
docker ps --filter "name=incident-"
echo ""
echo "Set INFRASTRUCTURE_MODE=docker and OPERATOR_ACCESS_TOKEN in .env, then restart IncidentVoice to connect."

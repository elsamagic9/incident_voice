#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR/infrastructure"

echo "🛑 Stopping Real Docker SRE Sandbox..."
docker compose down
echo "✅ Real containers stopped."

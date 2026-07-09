#!/bin/bash
set -e

cd /app/watcher
node --experimental-sqlite --no-warnings=ExperimentalWarning --import tsx src/index.ts &
WATCHER_PID=$!

cd /app/dashboard
node_modules/.bin/next start -p "${PORT:-3000}" &
DASHBOARD_PID=$!

wait -n "$WATCHER_PID" "$DASHBOARD_PID"
EXIT_CODE=$?
kill "$WATCHER_PID" "$DASHBOARD_PID" 2>/dev/null || true
exit "$EXIT_CODE"

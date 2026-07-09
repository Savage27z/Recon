#!/bin/bash
set -e

cd /app/watcher
node --experimental-sqlite --no-warnings=ExperimentalWarning --import tsx src/index.ts &
WATCHER_PID=$!

cd /app/dashboard
node_modules/.bin/next start -p "${PORT:-3000}" &
DASHBOARD_PID=$!

# Railway sends SIGTERM to this script (PID 1); bash does not forward signals
# to background jobs on its own, so without this trap both children get
# hard-killed on every redeploy instead of shutting down cleanly.
forward_signal() {
  kill -TERM "$WATCHER_PID" "$DASHBOARD_PID" 2>/dev/null || true
}
trap forward_signal SIGTERM SIGINT

wait -n "$WATCHER_PID" "$DASHBOARD_PID"
EXIT_CODE=$?
kill "$WATCHER_PID" "$DASHBOARD_PID" 2>/dev/null || true
exit "$EXIT_CODE"

#!/bin/sh
# Regenerate views/partials/critical-*.css (rare, manual; not part of
# `npm run build`). See the header comment in extract-critical.js.
#
# critical and playwright are deliberately not in package.json, so install
# them here without saving; the next plain `npm install` prunes them again.
# Chromium lives in ~/Library/Caches/ms-playwright (or ~/.cache/ms-playwright)
# and is downloaded only the first time.
set -e
cd "$(dirname "$0")"

npm install --no-save --no-audit --no-fund critical@9 playwright
npx playwright install chromium

SERVER_PID=
if curl -s -o /dev/null http://localhost:8080/; then
  echo "Using the dev server already running on :8080"
else
  npm run build
  echo "Starting dev server on :8080 ..."
  node src/app-www.js > extract-critical-server.log 2>&1 &
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null; rm -f extract-critical-server.log' EXIT
  i=0
  until curl -s -o /dev/null http://localhost:8080/; do
    i=$((i + 1))
    if [ $i -ge 60 ]; then
      echo "Dev server did not come up; see extract-critical-server.log" >&2
      trap - EXIT
      kill $SERVER_PID 2>/dev/null
      exit 1
    fi
    sleep 1
  done
fi

node extract-critical.js
git diff --stat -- 'views/partials/critical-*.css'

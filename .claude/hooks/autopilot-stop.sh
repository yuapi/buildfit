#!/usr/bin/env bash
# autopilot Stop hook (session mode).
# - Acts only while .autopilot/RUN exists. Sessions not running the loop are never blocked.
# - If .autopilot/STOP exists, removes RUN and lets the session end.
# - After AUTOPILOT_STALL_LIMIT (default 3) consecutive blocks with no change to the LOG
#   or commits, writes STOP and lets the session end (no endless blocking without progress).
# Release: create .autopilot/STOP, delete .autopilot/RUN, or remove this hook from settings.json
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
A=.autopilot
[ -f "$A/RUN" ] || exit 0
if [ -f "$A/STOP" ]; then
  rm -f "$A/RUN" "$A/.hook-state"
  exit 0
fi

sig="$({ cat "$A/LOG.md" 2>/dev/null; git rev-parse HEAD 2>/dev/null; } | cksum | cut -d' ' -f1)"
prev=""; n=0
if [ -f "$A/.hook-state" ]; then read -r prev n < "$A/.hook-state" || true; fi
case "$n" in ''|*[!0-9]*) n=0;; esac
if [ "$sig" = "$prev" ]; then n=$((n + 1)); else n=0; fi

limit="${AUTOPILOT_STALL_LIMIT:-3}"
if [ "$n" -ge "$limit" ]; then
  {
    echo "Final stop: no progress"
    echo "- The Stop hook blocked ending the session ${n} times in a row, but LOG.md and the commits did not change"
    echo "- Work may be stuck on permission denials or an environment problem. Check the last LOG entry"
  } > "$A/STOP"
  rm -f "$A/RUN" "$A/.hook-state"
  exit 0
fi
echo "$sig $n" > "$A/.hook-state"

cat << 'JSON'
{"decision":"block","reason":"autopilot session mode. Re-read the .autopilot/ state files and do the next task. If the queue is empty, start with rediscovery (including the product axis). Go straight on, no summary or report."}
JSON
exit 0

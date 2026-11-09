#!/usr/bin/env bash
set -euo pipefail

if [ "${#GATEWAY_TOKEN}" -lt 24 ]; then
  echo "GATEWAY_TOKEN must be set (>= 24 chars)" >&2; exit 1
fi

/usr/bin/supervisord -c /etc/supervisor/supervisord.conf &
SUP=$!

if [ "${ENABLE_VNC:-0}" = "1" ]; then
  if [ "${#VNC_PASSWORD}" -lt 8 ]; then
    echo "ENABLE_VNC=1 requires VNC_PASSWORD (>= 8 chars)" >&2; kill "$SUP"; exit 1
  fi
  x11vnc -storepasswd "$VNC_PASSWORD" /tmp/vncpass >/dev/null 2>&1
  for _ in $(seq 1 30); do [ -S /tmp/supervisor.sock ] && break; sleep 1; done
  supervisorctl -c /etc/supervisor/supervisord.conf start x11vnc novnc
  echo "noVNC login screen: https://<vnc-domain>/vnc.html  — set ENABLE_VNC=0 after logging in to TradingView" >&2
fi

wait "$SUP"

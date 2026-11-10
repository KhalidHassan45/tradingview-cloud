# TradingView Desktop + tradingview-mcp + tv-desktop-gateway in ONE container, for Coolify.
# Xvfb (virtual screen) → TradingView Desktop (--remote-debugging-port=9222, localhost only)
#   → tradingview-mcp (stdio) → gateway (Streamable HTTP :8787, token + tool allow-list) → Composio
# noVNC (:6080) is only for the one-time TradingView login; turn it off afterwards with ENABLE_VNC=0.
FROM node:20-bookworm-slim AS node

FROM ubuntu:22.04
ARG DEBIAN_FRONTEND=noninteractive
ARG TV_MCP_REPO=https://github.com/tradesdontlie/tradingview-mcp.git
ARG TV_MCP_COMMIT=c05b8f5755ed8e64ea242de88ddbf46aa24d56a4

# Node 20 from the official image (Ubuntu 22.04's own nodejs is too old)
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg git tini supervisor \
      xvfb fluxbox x11vnc novnc websockify xauth \
      fonts-dejavu fonts-noto-core fonts-noto-color-emoji \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 libpango-1.0-0 libcairo2 libgtk-3-0 \
  && rm -rf /var/lib/apt/lists/*

# TradingView Desktop — official apt repository (tradingview.com/support/solutions/43000728898)
RUN curl -fsSL https://tvd-packages.tradingview.com/keyring.gpg -o /usr/share/keyrings/tradingview-desktop-archive-keyring.gpg \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/tradingview-desktop-archive-keyring.gpg] https://tvd-packages.tradingview.com/ubuntu/stable jammy multiverse" \
       > /etc/apt/sources.list.d/tradingview-desktop.list \
  && apt-get update && apt-get install -y --no-install-recommends tradingview \
  && rm -rf /var/lib/apt/lists/* \
  && test -x /opt/TradingView/tradingview

RUN useradd -m -u 10001 tv
WORKDIR /opt/app

# tradingview-mcp pinned to a reviewed commit (it is unofficial third-party code)
RUN git clone "$TV_MCP_REPO" /opt/app/tradingview-mcp \
  && git -C /opt/app/tradingview-mcp checkout -q "$TV_MCP_COMMIT" \
  && cd /opt/app/tradingview-mcp && npm ci --omit=dev --ignore-scripts --no-audit --no-fund

COPY gateway/package.json /opt/app/gateway/package.json
RUN cd /opt/app/gateway && npm install --omit=dev --no-audit --no-fund
COPY gateway/gateway.mjs /opt/app/gateway/gateway.mjs
COPY supervisord.conf /etc/supervisor/supervisord.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /home/tv/.config && chown -R tv:tv /home/tv /opt/app

ENV DISPLAY=:99 SCREEN=1600x900x24 TVGW_HOST=0.0.0.0 TVGW_PORT=8787 \
    TV_MCP_SERVER=/opt/app/tradingview-mcp/src/server.js TV_CDP_PORT=9222 ENABLE_VNC=1 HOME=/home/tv
USER tv
VOLUME ["/home/tv/.config"]
EXPOSE 8787 6080
HEALTHCHECK --interval=1m --timeout=5s --start-period=90s \
  CMD curl -fsS http://127.0.0.1:8787/health >/dev/null && curl -fsS http://127.0.0.1:9222/json/version >/dev/null || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]

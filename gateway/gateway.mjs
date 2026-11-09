#!/usr/bin/env node
// tv-desktop-gateway — exposes tradesdontlie/tradingview-mcp (stdio, drives TradingView Desktop over CDP :9222)
// as a Streamable HTTP MCP endpoint for Composio, with a token and a TOOL ALLOW-LIST.
//
//   POST /mcp/<GATEWAY_TOKEN>     or   POST /mcp  + "Authorization: Bearer ***"
//   GET  /health                  (no auth, no data)
//
// Why an allow-list: the upstream server can run arbitrary JavaScript inside TradingView (ui_evaluate), click and type
// anywhere in the app (ui_*), edit/save Pine scripts, create alerts and self-update. Over the internet that is remote
// control of a logged-in app (possibly with a broker panel). Only read / chart-navigation tools pass by default.
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export const DEFAULT_ALLOW = [
  // health / discovery
  "tv_health_check", "tv_discover", "tv_ui_state",
  // market data (read)
  "quote_get", "symbol_info", "symbol_search", "depth_get", "data_get_ohlcv", "data_get_indicator",
  "data_get_study_values", "data_get_strategy_results", "data_get_trades", "data_get_equity",
  "data_get_pine_boxes", "data_get_pine_labels", "data_get_pine_lines", "data_get_pine_tables",
  // chart navigation (changes what is shown, not what you own)
  "chart_get_state", "chart_get_visible_range", "chart_set_symbol", "chart_set_timeframe", "chart_set_type",
  "chart_set_visible_range", "chart_scroll_to_date", "capture_screenshot",
  // read-only lists / analysis
  "watchlist_get", "alert_list", "indicator_search", "layout_list", "pane_list", "tab_list", "replay_status",
  "pine_list_scripts", "pine_get_source", "pine_get_errors", "pine_get_console", "pine_analyze", "pine_check",
];
// Never exposed, even if added to TVGW_ALLOW: arbitrary code / input injection / self-update.
export const NEVER = new Set(["ui_evaluate", "ui_click", "ui_mouse_click", "ui_keyboard", "ui_type_text", "ui_hover",
  "ui_find_element", "ui_open_panel", "ui_scroll", "ui_fullscreen", "batch_run", "tv_update", "tv_launch"]);

export function allowList(env = process.env) {
  const extra = (env.TVGW_ALLOW || "").split(",").map((s) => s.trim()).filter(Boolean);
  return new Set([...DEFAULT_ALLOW, ...extra].filter((t) => !NEVER.has(t)));
}

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function authorized(req, token) {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/mcp/")) return same(url.pathname.slice(5).replace(/\/$/, ""), token);
  if (url.pathname === "/mcp") {
    const h = req.headers.authorization || "";
    return h.startsWith("Bearer ") && same(h.slice(7), token);
  }
  return false;
}

export async function startGateway({ token, port = 8787, host = "127.0.0.1", serverPath, command = "node", args, env = process.env } = {}) {
  if (!token || token.length < 24) throw new Error("GATEWAY_TOKEN must be set (>= 24 chars)");
  const allow = allowList(env);
  const upstream = new Client({ name: "tv-desktop-gateway", version: "1.0.0" });
  await upstream.connect(new StdioClientTransport({ command, args: args || [serverPath], env: { ...env }, stderr: "inherit" }));

  const makeServer = () => {
    const s = new Server({ name: "tradingview-desktop", version: "1.0.0" }, { capabilities: { tools: {} } });
    s.setRequestHandler(ListToolsRequestSchema, async () => {
      const { tools } = await upstream.listTools();
      return { tools: tools.filter((t) => allow.has(t.name)) };
    });
    s.setRequestHandler(CallToolRequestSchema, async (req) => {
      const name = req.params.name;
      if (!allow.has(name)) {
        return { isError: true, content: [{ type: "text", text: `tool '${name}' is not allowed through the gateway` }] };
      }
      return upstream.callTool({ name, arguments: req.params.arguments || {} });
    });
    return s;
  };

  const httpServer = http.createServer(async (req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    if (req.method === "GET" && path === "/health") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, tools: allow.size }));
      return;
    }
    if (!(path === "/mcp" || path.startsWith("/mcp/"))) { res.writeHead(404).end(); return; }
    if (!authorized(req, token)) {
      res.writeHead(401, { "content-type": "application/json" }).end('{"error":"unauthorized"}');
      return;
    }
    let body = "";
    for await (const chunk of req) { body += chunk; if (body.length > 1_000_000) { res.writeHead(413).end(); return; } }
    let parsed;
    try { parsed = body ? JSON.parse(body) : undefined; } catch { res.writeHead(400).end(); return; }
    const server = makeServer();                                  // stateless: one server+transport per request
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, parsed);
  });
  await new Promise((r) => httpServer.listen(port, host, r));
  return { httpServer, upstream, allow, close: async () => { httpServer.close(); await upstream.close(); } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const serverPath = process.env.TV_MCP_SERVER || join(homedir(), "tradingview-mcp", "src", "server.js");
  startGateway({
    token: process.env.GATEWAY_TOKEN, serverPath,
    port: Number(process.env.TVGW_PORT || 8787), host: process.env.TVGW_HOST || "127.0.0.1",
  }).then(({ allow }) => {
    console.error(`tv-desktop-gateway on http://${process.env.TVGW_HOST || "127.0.0.1"}:${process.env.TVGW_PORT || 8787}/mcp  (${allow.size} tools allowed)`);
  }).catch((e) => { console.error("gateway failed:", e.message); process.exit(1); });
}

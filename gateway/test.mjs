import { test } from "node:test";
import assert from "node:assert";
import { DEFAULT_ALLOW, NEVER, allowList, authorized } from "./gateway.mjs";

test("default allow-list excludes ui_* and control tools", () => {
  const allow = allowList({ TVGW_ALLOW: "" });
  assert.equal(allow.has("quote_get"), true);
  assert.equal(allow.has("ui_evaluate"), false);
  assert.equal(allow.has("tv_launch"), false);
});

test("TVGW_ALLOW adds tools but never the forbidden set", () => {
  const allow = allowList({ TVGW_ALLOW: "alert_create, ui_evaluate, batch_run" });
  assert.equal(allow.has("alert_create"), true);
  assert.equal(allow.has("ui_evaluate"), false);
  assert.equal(allow.has("batch_run"), false);
});

test("authorized accepts path token and Bearer header", () => {
  const token = "secret123456789012345678901234";
  assert.equal(authorized({ url: "/mcp/" + token, headers: {} }, token), true);
  assert.equal(authorized({ url: "/mcp", headers: { authorization: "Bearer " + token } }, token), true);
  assert.equal(authorized({ url: "/mcp/wrong", headers: {} }, token), false);
});

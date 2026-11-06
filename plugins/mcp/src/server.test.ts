import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import plugin from "./server.js";

async function load() {
  const rpcCalls: unknown[] = [];
  const host = createFakePluginHost({
    pluginId: "bb--mcp",
    loopbackBaseUrl: "http://127.0.0.1:4000",
    sdk: {
      plugins: {
        callRpc: async (args: unknown) => {
          rpcCalls.push(args);
          throw new Error("unexpected plugin RPC");
        },
      },
    },
  });
  await plugin(host.bb);
  return { host, rpcCalls };
}

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  },
});

function mcpRequest(headers: Record<string, string>): RequestInit {
  return {
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: INITIALIZE,
  };
}

describe("MCP route", () => {
  it("answers a local caller", async () => {
    const { host } = await load();
    const response = await host.harness.fetchHttp(
      "POST",
      "/mcp",
      mcpRequest({}),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"name":"bb"');
  });

  it("refuses web pages and bb connect gate callers before any MCP handling", async () => {
    const { host } = await load();
    const refused: Record<string, string>[] = [
      { origin: "https://evil.example" },
      { "x-bb-gate-auth": "oauth", "x-bb-gate-oauth-scope": "bb" },
      { "x-bb-gate-auth": "session" },
    ];
    for (const headers of refused) {
      const response = await host.harness.fetchHttp(
        "POST",
        "/mcp",
        mcpRequest(headers),
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: "forbidden" });
    }
  });
});

describe("bb mcp", () => {
  it("prints only the local address without asking for a bb account", async () => {
    const { host, rpcCalls } = await load();
    const json = await host.harness.runCli(["status", "--json"]);
    expect(JSON.parse(json.stdout)).toEqual({
      localUrl: "http://127.0.0.1:4000/api/v1/plugins/bb--mcp/http/mcp",
    });
    const text = await host.harness.runCli(["status"]);
    expect(text.stdout).toBe(
      "Local: http://127.0.0.1:4000/api/v1/plugins/bb--mcp/http/mcp",
    );
    expect(rpcCalls).toEqual([]);
  });

  it.each(["clients", "revoke"])(
    "no longer offers the account-backed %s command",
    async (command) => {
      const { host } = await load();
      const result = await host.harness.runCli([command, "grant_1"]);
      expect(result.exitCode).not.toBe(0);
    },
  );
});

import { cliCommand, defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";
import { mcpAccessProblem } from "./access.js";
import { createCliRunner } from "./cli-runner.js";
import { createCommandIndexLoader } from "./command-index.js";
import { createBbMcpHttpHandler } from "./mcp-handler.js";

const MCP_SERVER_VERSION = "0.1.0";
const MCP_ROUTE_PATH = "/mcp";

const JSON_OPTION = {
  type: "boolean",
  description: "Emit machine-readable JSON",
} as const;

function localMcpUrl(bb: BbPluginApi): string {
  return `${bb.server.loopbackBaseUrl}/api/v1/plugins/${bb.pluginId}/http${MCP_ROUTE_PATH}`;
}

export default async function mcpPlugin(bb: BbPluginApi): Promise<void> {
  const runCli = createCliRunner({
    env: process.env,
    serverUrl: () => bb.server.loopbackBaseUrl,
  });
  const handler = createBbMcpHttpHandler(
    { runCli, loadCommandIndex: createCommandIndexLoader(runCli) },
    MCP_SERVER_VERSION,
    (error) => bb.log.warn(`MCP request failed: ${error.message}`),
  );
  bb.onDispose(() => handler.close());

  for (const method of ["POST", "GET", "DELETE"]) {
    bb.http.route(
      method,
      MCP_ROUTE_PATH,
      async (context) => {
        const problem = mcpAccessProblem(context.req.raw.headers);
        if (problem !== null) {
          return Response.json(
            { error: "forbidden", message: problem.message },
            { status: problem.status },
          );
        }
        return handler.fetch(context.req.raw);
      },
      { auth: "none" },
    );
  }

  bb.cli.register(
    defineCli({
      name: "mcp",
      summary: "Let MCP clients control this bb",
      description:
        "While this plugin is enabled, bb serves a Model Context Protocol endpoint on the bb server's port, and `status` prints its loopback address. It needs no sign-in and refuses only requests from web pages and bb connect gate requests, so anything that can reach the server port can use it. Foundry has no signed-in remote MCP address.",
      commands: {
        status: cliCommand({
          summary: "Show the MCP address for this bb",
          options: { json: JSON_OPTION },
          async run(input) {
            const localUrl = localMcpUrl(bb);
            return {
              exitCode: 0,
              stdout: input.options.json
                ? JSON.stringify({ localUrl })
                : `Local: ${localUrl}`,
            };
          },
        }),
      },
    }),
  );
}

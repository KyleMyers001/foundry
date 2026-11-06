const GATE_HEADER_PREFIX = "x-bb-gate-";

export interface McpAccessProblem {
  status: 403;
  message: string;
}

function refuse(message: string): McpAccessProblem {
  return { status: 403, message };
}

export function mcpAccessProblem(headers: Headers): McpAccessProblem | null {
  for (const name of headers.keys()) {
    if (name.startsWith(GATE_HEADER_PREFIX)) {
      return refuse(
        "Foundry has no bb connect, so the bb MCP endpoint refuses bb connect gate requests.",
      );
    }
  }
  return headers.get("origin") === null
    ? null
    : refuse("The bb MCP endpoint does not accept requests from web pages.");
}

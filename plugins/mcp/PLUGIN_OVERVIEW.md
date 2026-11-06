Control bb from Claude, Codex, or any other app that speaks the Model Context Protocol and can reach the bb server. Ask the app to check on your agents, start a thread, or answer a question an agent is waiting on.

## What you get

- An MCP address on the bb server's port. `bb mcp status` prints its loopback form.
- No sign-in. The endpoint refuses requests from web pages and bb connect gate requests, and nothing else: anything that can reach the bb server's port can use it.
- Foundry has no signed-in remote MCP address: the bb account and bb connect sign-in that served one are gone.

## How it works

The app sees three tools. `search` finds `bb` commands. `read` and `run` execute a short script that calls the `bb` command line, so the app can do anything the CLI can and combine several steps in one call. Scripts run in a sandbox on your bb server. `read` accepts only commands that inspect bb, so an app can run it without asking you each time. `run` accepts any command.

Access is all or nothing. An app that can reach the address can start and steer agents, which run commands and change files on the machines this bb controls, so connect only apps you trust.

## CLI

- `bb mcp status [--json]`: show the loopback address.

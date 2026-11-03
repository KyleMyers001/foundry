Control bb from Claude, Codex, or any other app on the same machine that speaks the Model Context Protocol. Ask the app to check on your agents, start a thread, or answer a question an agent is waiting on.

## What you get

- A local MCP address for apps on the same machine as the bb server.
- Foundry has no remote MCP address: the bb account and bb connect sign-in that served one are gone.

## How it works

The app sees three tools. `search` finds `bb` commands. `read` and `run` execute a short script that calls the `bb` command line, so the app can do anything the CLI can and combine several steps in one call. Scripts run in a sandbox on your bb server. `read` accepts only commands that inspect bb, so an app can run it without asking you each time. `run` accepts any command.

Access is all or nothing. An app that can reach the local address can start and steer agents, which run commands and change files on the machines this bb controls, so connect only apps you trust.

## CLI

- `bb mcp status [--json]`: show the local address.

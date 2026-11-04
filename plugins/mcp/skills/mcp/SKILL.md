---
name: mcp
description: Connect an MCP client, such as Claude or Codex, to this bb through its MCP address on the bb server's port.
---

# bb MCP server

The MCP server plugin lets an MCP client control this bb. It is off by default. Turn it on in Settings → Plugins or with `bb plugin enable bb--mcp`.

## Address

`bb mcp status [--json]` prints the loopback address:
`http://127.0.0.1:<port>/api/v1/plugins/bb--mcp/http/mcp`. The endpoint needs
no sign-in and has the same trust as the `bb` CLI. It refuses requests from web
pages (any `Origin` header) and requests carrying bb connect gate headers, and
checks nothing else: anything that can reach the bb server's port can use it,
including other computers when the server listens beyond loopback.

Foundry has no signed-in remote MCP address. The bb account and bb connect that
signed in remote apps such as ChatGPT or Claude on the web are gone, and so are
the `bb mcp clients` and `bb mcp revoke` commands that listed and disconnected
them.

## What connecting an app grants

Access is all or nothing. An app that can reach the address can run any
`bb` command: it can see everything in this bb, and it can start and message
agents and open terminals, which run commands and change files on the machines
this bb controls. Connect only apps you trust.

## Tools the client sees

- `search` finds `bb` commands for a task.
- `read` runs a JavaScript snippet that can call only commands that inspect bb. It is marked read-only so the app can run it without asking you each time; it is not a separate permission.
- `run` runs a JavaScript snippet that can call any `bb` command.

Snippets call `bb.cli([...argv])` or `bb.json([...argv])` and run in a sandbox on the bb server with no network or file access. A snippet is stopped after 25 seconds, after 3 seconds of computation, or when it runs out of its 64 MB of memory, and runs at most 4 `bb` commands at a time.

Three commands cannot run over MCP because they need an interactive terminal or never exit: `bb terminal attach`, `bb plugin dev`, and `bb browser watch`.

## Protocol

The endpoint speaks MCP 2026-07-28 and also answers 2025-era clients. It is stateless: there are no sessions.

# Foundry

Foundry is an independent fork of [bb](https://github.com/get-bb/bb), the agentic
IDE that builds itself. It can control, customize, and automate itself, laying
the groundwork for your own software factory.

Every surface — the desktop app, web app, CLI, and HTTP API — is a first-class
way to drive it. Work runs in threads you can follow live, steer at any point,
or hand off to another agent.

> [!NOTE]
> Foundry is maintained by Kyle Myers and is not affiliated with or endorsed by
> the bb project. It forked from `get-bb/bb` at commit
> [`916d684ac`](https://github.com/get-bb/bb/commit/916d684ac23d0b0de82c09cfc7553a50287d2188)
> (2026-10-30). The fork has not changed the product yet, so it still looks and
> behaves like bb.

<p align="center">
  <img alt="The bb desktop app, which Foundry inherits, showing a code review thread, dispatch panel, and task board" src="assets/app-screenshot.png" width="800">
</p>

## Run Foundry

Foundry has no published packages or desktop builds, so run it from source.
`npx bb-app` and the bb desktop downloads install upstream bb, not this fork.

You need:

- Node.js 22.19, 24, or 26.
- pnpm 9.15. Run `corepack enable` to use the version pinned in `package.json`.
- Git.
- At least one supported agent provider you have already authenticated:
  [Claude Code](https://docs.anthropic.com/en/docs/claude-code),
  [Codex](https://developers.openai.com/codex/cli), Cursor via ACP,
  [Pi](https://github.com/earendil-works/pi/tree/main/packages/coding-agent), or
  another ACP-compatible agent.

```bash
git clone https://github.com/KyleMyers001/foundry.git
cd foundry
pnpm install
pnpm start
```

Then open `http://localhost:38886`.

`pnpm start` uses the same `~/.bb` data directory and port as an installed copy
of bb, so stop bb first and expect Foundry to open bb's existing projects and
threads. To keep them apart, use [the development loop](#development), which
gets its own data directory and ports.

To drive that instance from the command line, run `pnpm bb --help`.

## What Still Says bb

The rename covers this repository's top-level documentation, not its code. These
names are unchanged, so commands and paths throughout the docs still use them:

- the `bb` CLI and the name shown in the app
- the `bb-app`, `@bb/*`, and `@get-bb/*` packages
- `BB_*` environment variables
- the `~/.bb` and `~/.bb-dev` data directories and `.bb/` workspace files

Most guides under `docs/` and the package READMEs were written for bb and still
call the product bb. They describe Foundry's behavior unless they cover bb's own
releases or hosted services.

Some defaults still lead to services and releases from the bb project:

- Desktop builds look for updates in `get-bb/bb` GitHub releases.
- bb connect, the remote access service, defaults to `https://getbb.app`.
- Settings → Mobile links to bb's iOS TestFlight and its Android APK in
  `get-bb/bb` releases.
- Settings → Community links to bb's Discord, which is for bb rather than Foundry.
- Telemetry goes to the PostHog project inherited from bb.

### Telemetry

Foundry inherits bb's telemetry unchanged. Production runs, including `pnpm start`,
send anonymous usage telemetry (app starts, thread creation counts, user message
counts, and plugin installs) to the default PostHog project inherited from bb.
Each event carries the app version, how the app was installed (desktop, npm, or
source checkout), and the OS release, CPU architecture, and Node version. Source
checkouts report whether `origin` points to `github.com/get-bb/bb`, another
repository, or is unavailable, so a Foundry checkout reports as another
repository. Telemetry never includes Git commit hashes or remote URLs.
Identification is a random per-install id stored in your data dir — no user,
host, project, workspace, or message content is ever attached. Plugin install
events name only public plugins (bundled plugins and `bb-community` marketplace
entries); installs from a local path, a private git or npm source, or a
third-party marketplace report no name. Development runs (`pnpm dev`,
`pnpm start:worktree`) never send.

Opt out any run with `BB_TELEMETRY=false`. See
[`apps/server/src/services/system/telemetry.ts`](./apps/server/src/services/system/telemetry.ts).

## Development

Use the development loop when working on Foundry itself:

```bash
pnpm dev
```

That starts the Vite app and proxies API and WebSocket traffic to a separate
dev server. The launcher prints the actual ports at startup. Each checkout gets
a data directory under
`~/.bb-dev/<checkout-instance>/` and deterministic high ports derived from the
checkout path. The checkout instance id is the sanitized path to the checkout,
relative to your home directory, plus a short hash suffix. Separate worktrees
can run alongside each other and the packaged `npx bb-app@latest` instance.

To test the production bundle and serving path without switching to production
data or ports, use:

```bash
pnpm start:worktree
```

This builds the same optimized frontend and runtime artifacts as `pnpm start`,
then serves the app from the BB server on the checkout-specific dev server port.
It keeps the normal checkout-specific dev data directory and host-daemon port.
There is no Vite dev server or hot reload in this mode; rerun the command after
source changes. As with `pnpm dev`, worktree starts do not send telemetry.

For the Electron desktop shell, keep `pnpm dev` running and start the desktop
package in a second terminal:

```bash
pnpm exec turbo run dev --filter=@bb/desktop
```

The desktop shell connects to this checkout's running dev app. Stop each command
with Ctrl-C in its terminal.

To use the dev app from another machine over Tailscale, start it with the
Tailscale browser origin configured:

```bash
BB_APP_URL=https://<machine>.<tailnet>.ts.net pnpm dev
```

Note the printed app port, then publish the loopback Vite listener in another
terminal:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:<app-port>
```

Then open `https://<machine>.<tailnet>.ts.net`. Source dev binds both the Vite
app and main server to loopback by default; Vite continues to proxy API and
WebSocket traffic.

For direct access at `http://<tailscale-ip>:<app-port>` instead, run:

```bash
pnpm dev:remote
```

This binds the Vite app and main server to all IPv4 interfaces. The remote
browser must be able to reach both the printed app and server ports for realtime
updates. The server API is unauthenticated and permits command execution and
file reads, so use this only behind a trusted network boundary and restrict the
ports to Tailscale traffic with the host firewall when the LAN is not trusted.

To access the production-style worktree server directly from another machine,
run:

```bash
pnpm start:worktree-remote
```

This uses the same checkout-specific data directory and ports as
`pnpm start:worktree`, but binds its single server listener to all IPv4
interfaces. The server API is unauthenticated and permits command execution and
file reads, so use it only behind a trusted network boundary and restrict the
port to Tailscale traffic with the host firewall when the LAN is not trusted.

To use the component storybook from another machine, run:

```bash
pnpm storybook
```

Ladle binds to all interfaces and configures its HMR WebSocket to use the
browser's current host instead of `localhost`. Do not run `pnpm storybook` on an
untrusted network.

Development behavior is intentionally split:

- the app hot reloads itself
- the server does not hot reload
- the host daemon does not hot reload

When you want the server and host daemon to pick up the latest build output, use:

```bash
pnpm dev:restart
pnpm dev:restart-server
pnpm dev:restart-host-daemon
```

These rebuild first, then restart only the targeted stateful services.

To run a production-mode build from a source checkout:

```bash
pnpm start
```

That builds only the app, server, and host-daemon runtime artifacts, then runs
the launcher directly against those workspace outputs. Use the `bb-app`
tarball smoke task when validating the published `npx bb-app@latest` package
layout.

```bash
pnpm bb --help            # built CLI, targets the default/prod instance
pnpm reset                # clear production state

pnpm bb:dev --help        # source CLI, targets this checkout's dev instance
pnpm reset:dev            # clear this checkout's dev state

pnpm reset:all            # clear both production and dev states
```

These reset commands prompt for confirmation before deleting anything.

## Repository Overview

See [Repository overview](docs/repository-overview.md) for the monorepo package and app map.

## System Overview

See [System overview](docs/system-overview.md) for runtime architecture, data model, and component boundaries.

## Further Reading

These guides are inherited from bb.

- [Vision](docs/VISION.md)
- [Platform support](docs/platform-support.md)
- [Configuration](docs/configuration.md)
- [Using bb on multiple devices](docs/multiple-devices.md)
- [Worktrees and setup scripts](docs/worktrees.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Troubleshooting

### `Could not locate the bindings file`

Foundry uses native add-ons, for example `better-sqlite3` and `@parcel/watcher`.
Their binaries are built during `pnpm install` for one Node.js major version,
operating system, CPU architecture, and libc. Foundry stops at startup with this
error if they are missing or were built for something else:

```
Error: Could not locate the bindings file. Tried:
 → .../node_modules/better-sqlite3/build/better_sqlite3.node
```

To recover, for example after changing Node.js versions, run:

```bash
pnpm install
pnpm ensure-native-modules
```

If you hit this error with `npx bb-app`, you are running upstream bb. See
[bb's README](https://github.com/get-bb/bb#troubleshooting).

## Credits

Foundry exists because of [bb](https://github.com/get-bb/bb) and the people who
built it. bb was created by Michael Yong, the copyright holder of the original
work, with major contributions from Sawyer Hood, Bersabel Tadesse, and
[many other contributors](https://github.com/get-bb/bb/graphs/contributors).
This repository keeps bb's full commit history, so their authorship stays with
their work.

For bb itself, including releases and community, see
[getbb.app](https://getbb.app).

bb's CI is powered by [Blacksmith](https://blacksmith.sh).

## License

Foundry is released under the [MIT License](LICENSE), the license bb uses, and
keeps bb's original copyright notice.

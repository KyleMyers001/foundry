# Using bb on multiple devices

There are two separate ways to use more than one device with bb:

- A browser device is a control surface for one bb server. It can view projects,
  send prompts, and manage threads, but it does not execute them.
- An execution machine runs a host daemon. One bb server can dispatch project
  sources and thread environments across several enrolled machines.

You can use either story independently or combine them.

In both stories one computer runs the bb server. It stores your threads, the
database, and settings, and every browser and execution machine connects to it.
Pick a computer that stays on, such as a desktop, home server, or VM: while the
server machine is asleep or off, nothing can reach bb and running threads may
stop. Settings → Machines badges it `server` once several machines are
connected, `bb machine list` shows `server` in its Role column, and the server
machine cannot be removed.

## Open bb from another browser

Foundry has no hosted route such as bb connect. For a private tailnet route,
keep bb on its loopback default and publish it through Tailscale Serve:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:38886
pnpm start config set BB_APP_URL https://<machine>.<tailnet>.ts.net
```

Start bb with `pnpm start` (or the desktop app) and open the HTTPS URL.
Tailscale ACLs are the access boundary for this route; do not expose the server
through Funnel or the public internet.

Existing remote host daemons that target a direct tailnet IP or
`http://<machine>.<tailnet>.ts.net:38886` must migrate before restarting an
upgraded server. Open bb through the Tailscale Serve URL and re-run the Add
machine installer from there. Machines added through bb connect by an older
version also need that: set a server URL reachable by machines, then reconnect
them from Settings → Machines or with `bb machine reconnect <id-or-name>`.

For compatibility only, `pnpm start --server-bind-host 0.0.0.0` restores direct
IPv4 network access. The public API is unauthenticated and permits command
execution and file reads, so use wildcard binding only behind a trusted network
boundary and never through Funnel or the public internet.

Inside a container, `0.0.0.0` listens on the container's IPv4 interfaces; the
container runtime must still publish that port to the host (for example,
`docker run -p 3000:3000 ...`). Host firewall and upstream network rules also
remain separate from bb's bind setting.

### Use editors installed on the browser device

Local editor integration is optional. It connects the remote bb page to the
loopback-only helper started by the bb desktop app or `pnpm start` on the
computer running the browser. The helper discovers installed editors and opens
paths without exposing its API to the network.

If that browser should open work-host files in its local editor, first make
sure bb is running on the browser device. Verify `ssh <work-host>` succeeds
there, then map the server/work-host to that SSH target:

```bash
pnpm start client ssh-target set <bb-server-origin> <ssh-target> --host-id <work-host-id>
```

Copy the work-host ID from `bb machine list`. `--host-id` may be omitted when
the server has exactly one machine. A browser running on an enrolled execution
machine needs no SSH mapping for that same machine: connected daemons report
their helper ports to the server, and the browser discovers the matching local
helper after you enable integration.

Then open Settings → Files in that browser and enable **Local editor
integration**. The browser may ask once for permission to connect to software
on the computer. bb does not request that permission during normal remote page
loads; it is only needed for discovering and launching local editors.

If Settings reports that it cannot connect to the helper:

1. Confirm the bb desktop app or `pnpm start` is running on the browser device.
2. Confirm the browser allows local network access for the bb page.
3. A helper enrolled with this exact server trusts its origin automatically.
   For a separate local bb helper serving a custom HTTPS or Tailscale browser,
   configure that exact origin with
   `pnpm start config set BB_APP_URL <origin>` and restart bb.
4. Return to Settings → Files and choose **Retry**.

Phones and tablets need no helper; editor-launch actions are simply unavailable.

## Use the bb mobile app

The bb mobile app is a client for a bb server; it runs nothing itself.
Foundry does not publish mobile builds; build one from
[`apps/mobile`](../apps/mobile/README.md). On a trusted network the app uses a
direct server URL (Tailscale Serve or `--server-bind-host 0.0.0.0`) with the
same caveats as a browser. A server saved over bb connect by an older build
stays listed but cannot connect; add it again by its direct URL. Foundry sends
no mobile push notifications; browser and desktop notifications still work.
What the phone cannot do is listed in
[platform-support.md](platform-support.md#mobile-app).

## Point the desktop app at another bb

The desktop app's Server menu lists "This Mac" and your custom server URLs.
When you select a remote server, the app stops starting a bb server on this
Mac. It starts one again only when you select "This Mac". A bb connect server
saved by an older version is kept but never dialed; the app shows a page that
asks you to add the server again by its direct URL.

A remote server has no realtime link for keybindings and theme. The app re-reads
them when it starts, when it becomes active, and every five minutes.

## Add an execution machine

Open Settings → Machines and choose Add a machine. Run the generated one-line
installer on the computer that should
execute work. Choose Windows in the dialog for a PowerShell command; a Windows
machine needs Node.js 22.19 or newer and Git for Windows, and its daemon starts
when you sign in to Windows. It installs and enrolls a host daemon. Open the
server through a Tailscale Serve URL before generating the installer; the
loopback listener is not directly reachable from another machine. When the
server URL is a loopback or unspecified address, the dialog does not show an
installer. It asks you to set up machine access first by choosing the address
machines should use. Once access is ready, the dialog also names the server
machine the new machine will depend on.

The installer always installs the exact host-only `bb-app` package exposed by
that server at `/install/bb-app.tgz`: the host daemon, provider/plugin workers,
native host dependencies, and bundled `bb` CLI, but no web app or server. A
`bb-app` already on PATH, or the npm registry, is used only when the server
provides no package. The installer verifies the route's SHA-256 digest and
skips reinstalling an identical artifact. Like `/install.sh`, the package route
is public. npm installs the package into the machine's bb data directory, not
its system-wide global prefix, so enrollment needs neither `sudo` nor a PATH
change.

Each joined server gets its own daemon instance, data directory
(`~/.bb-machines/<server-host>`, override with `BB_DATA_DIR` when running the
installer), local API port, and launchd/systemd service. The installer persists
the selected port in that data directory. Subsequent runs reuse it; pass
`--host-daemon-port <port>` to the installer to override the selection. One machine can therefore
serve several bb servers at once, and joining never touches a full local bb
install's `~/.bb`. Each instance keeps its own `bb-app` under that data
directory and self-updates against its own server, so servers running different
bb versions on one machine remain isolated.

On Linux, the installer uses the current user's systemd manager (or a system
unit when run as root on a non-container systemd host). If the user bus is
unavailable on a systemd host, installation fails before enrolling or creating
a unit; rerun it from a systemd user session. In containers and on machines without systemd
as init, the installer runs a detached daemon instead. Set
`BB_INSTALL_SKIP_SERVICE=1` only when a detached daemon is acceptable: no
service starts it after a reboot. The temporary daemon used
for a first join is not supervised. When the installer starts a previously
joined daemon without a service, its launcher restarts it after crashes and
self-updates while the launcher remains running.

The installed launchd/systemd service enables `--auto-update`. If session open
reports a newer server protocol, the daemon downloads the server artifact,
verifies its SHA-256 digest, updates its private install, then exits so the
service manager restarts it. Failed attempts fall back to normal reconnect behavior with a persisted
exponential retry backoff from 5 seconds to 5 minutes. Settings → Machines and
`bb machine retry-update <id-or-name>` can bypass the current backoff. A daemon
never downgrades itself to an older server protocol. To opt out, remove
`--auto-update` from
`~/Library/LaunchAgents/app.getbb.host-daemon.<server>.plist` or
`~/.config/systemd/user/bb-host-daemon-<server>.service`, then reload the
service.

After it connects:

1. To create a project from that machine, choose New project, select the
   machine, and browse to its folder. To map an existing project there instead,
   add its path or clone source in project settings.
2. Select the machine when creating a thread, or use `bb thread spawn --machine
<id-or-name> ...`.
3. Inspect enrolled machines with `bb machine list`.

Machine names are conveniences and may be duplicated; CLI targeting by name
requires an unambiguous match. IDs are always accepted. Removing a machine from
Settings stops bb from dispatching new work to it.

Browser access and execution remain independent: opening bb on a laptop does
not enroll that laptop, and enrolling it as a machine does not expose the bb UI.

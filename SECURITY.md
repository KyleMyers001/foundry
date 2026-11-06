# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities in Foundry privately through
[GitHub private vulnerability reporting](https://github.com/KyleMyers001/foundry/security/advisories/new).
Do not open a public GitHub issue for a suspected vulnerability.

Include as much of the following as you can:

- the affected component (server, host daemon, app, desktop app, CLI, or a
  plugin) and version or commit
- steps to reproduce, or a proof of concept
- the impact you expect an attacker could achieve

Foundry is an independent fork of [bb](https://github.com/get-bb/bb) and uses
none of the services the bb project hosts. If a vulnerability also affects bb,
please also report it privately to the bb project at
**support@terragonlabs.com**.

## Supported versions

Foundry has no published releases. Fixes land on `main`, and only the latest
commit on `main` is supported.

## Scope

Foundry's server binds to loopback by default, and its local HTTP API is
unauthenticated by design: anyone who can reach it can run commands on the
host. Exposing it with `--server-bind-host 0.0.0.0` on an untrusted network is
documented as unsafe (see [docs/multiple-devices.md](docs/multiple-devices.md)).
Reports that a process on the same machine, or a peer the user chose to expose
the API to, can drive Foundry are out of scope. Ways for a web page, a remote
party, or an untrusted repository to reach or drive a Foundry server or host
daemon are in scope.

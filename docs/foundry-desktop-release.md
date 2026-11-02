# Releasing Foundry Desktop

Foundry ships one thing: a signed, notarized macOS (Apple silicon) app on
GitHub Releases. It is not published to npm. `docs/bb-release-process.md`,
`build-desktop.yml`, and `publish-bb-app.yml` describe upstream bb's process and
do not apply here.

## Set up signing once

Add these repository secrets. Set them yourself with `gh secret set`, and keep
their values out of chat, logs, and commits.

| Secret                       | Value                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `MACOS_CERTIFICATE_P12`      | Base64 of a `.p12` holding your `Developer ID Application` certificate and key: `base64 -i DeveloperID.p12`. |
| `MACOS_CERTIFICATE_PASSWORD` | Password chosen when exporting the `.p12`.                                                                   |
| `APPLE_ID`                   | Apple ID email for the Developer Program account.                                                            |
| `APPLE_APP_PASSWORD`         | App-specific password from `appleid.apple.com`.                                                              |
| `APPLE_TEAM_ID`              | Team ID from `developer.apple.com/account`.                                                                  |
| `MACOS_CERTIFICATE_NAME`     | Optional. Certificate common name, when the `.p12` holds more than one identity.                             |

The certificate must be `Developer ID Application`. An `Apple Development` or
`Apple Distribution` certificate does not work outside the App Store.

## Test a build

```bash
gh workflow run release-desktop-macos.yml --repo KyleMyers001/foundry --ref main -f publish=false
```

This runs the checks and uploads the app as a workflow artifact. Without the
secrets the app is unsigned, and it is still a valid test of the build.

## Publish a release

1. On a feature branch, run `node scripts/bump-version.mjs --patch`, then land
   it on `main` through a pull request. Each version publishes once.
2. Run the workflow from `main`:

   ```bash
   gh workflow run release-desktop-macos.yml --repo KyleMyers001/foundry --ref main -f publish=true
   ```

Publishing fails before the build if the run is not on `main`, the version is a
prerelease, a signing secret is missing, or an existing release belongs to a
different commit.

The run creates a draft `desktop-v<version>`, uploads every artifact, then
publishes it and marks it as GitHub's latest. Installed apps read
`releases/latest/download/desktop-version.json` and `latest-mac.yml`. Both feeds
pin binary URLs to the immutable versioned release, so cached metadata still
works after a newer release becomes latest. There is no moving release to reset.

If an upload fails, the previous release stays live and the incomplete draft can
be resumed by rerunning the workflow on the same commit. A published release on
the same commit is a no-op; its assets are never replaced. A different commit
requires a version bump.

Download the `.dmg` from
<https://github.com/KyleMyers001/foundry/releases/latest>.

## Running beside bb

Packaged Foundry has its own app identity, `io.github.kylemyers001.foundry`, and
applies these defaults at launch unless the variable is already set:

| Variable              | Foundry default |
| --------------------- | --------------- |
| `BB_DATA_DIR`         | `~/.foundry`    |
| `BB_SERVER_PORT`      | `38986`         |
| `BB_HOST_DAEMON_PORT` | `38987`         |
| `BB_TELEMETRY`        | `false`         |

An installed bb keeps `~/.bb` and ports `38886` and `38887`, so the two do not
share threads, projects, or settings. The `bb` CLI inside a Foundry thread comes
from `~/.foundry/bin/bb`. Its Electron update cache is also separate from bb:
`~/Library/Caches/foundry-desktop-updater` on macOS. Nightly builds use
`foundry-desktop-nightly-updater`. Source checkouts and `pnpm dev:desktop` are
unaffected.

## Known upstream ties

These are not changed by a release: the plugin marketplace and bb connect still
default to `getbb.app`, and in-app text and the official plugin logo still say bb.

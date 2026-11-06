# Native mobile shell

Status: **2026-09-05: 12 partial/blocked**. See [the audit](../MAINTENANCE.md) and [per-recipe ledger](../validation-2026-09-05.json).

## Setup and entry points

Use an iOS Simulator/device and Android emulator/device with a development
build from `apps/mobile/package.json`; consult current Expo configuration for
bundle identifiers and scripts. Point it only at the fresh source server.
Record OS/build, profile, server URL and source commit. Chromium touch
emulation is insufficient. Foundry sends no mobile push notifications.

The active native routes are a WebView shell plus device settings and saved
servers.
Core conversation/project/settings features run in that WebView: repeat their
core recipes there. Older README descriptions of standalone native thread
screens are not evidence that those routes still exist.

## Source

- `apps/mobile/src/screens/shell/RootNavigator.tsx`
- `apps/mobile/src/screens/settings/DeviceSettingsScreen.tsx`
- `apps/mobile/src/screens/settings/ServersScreen.tsx`
- `apps/mobile/app/+native-intent.tsx`
- `apps/mobile/package.json`

## Feature recipes

| Feature | Drive | Observable success |
| --- | --- | --- |
| First launch | Launch with an empty test profile store, then add a valid direct server URL and label. | First run opens Add server; a valid profile opens the intended server WebView and persists after relaunch. |
| Saved servers | Add a second fixture profile, switch active server, sign in again where offered, cancel removal and remove the fixture. | Profile selection, labels and authorization stay distinct; removing one does not clear another. |
| Retired bb connect profile and deep links | Seed a profile store holding a `mode: "connect"` profile from an older build, then open `bb://` links for a direct profile. | The connect profile stays listed, never connects, and shows "bb connect is no longer supported" with Open Servers; the profile index is not rewritten. `bb://` links open the right direct profile or a recoverable error. |
| WebView lifecycle | Navigate and compose in the WebView, background/foreground, rotate and reload. | Session/route/draft behavior follows the core app contract without duplicate dispatch or broken safe-area layout. |
| Connection state | Stop the test server or network, inspect the banner, then reconnect. | Offline/reconnecting state is truthful and the same profile recovers without switching servers. |
| Device settings | Open This device, inspect version, toggle haptics, reload page, and cancel/confirm Clear website data for the test profile. | Device preferences persist; reload targets its page and clearing has only the documented data scope. |
| Native appearance | Choose System/Light/Dark and change OS mode while native settings and WebView are visible. | Native header/surfaces and supported web bridge appearance stay coherent after relaunch. |
| App-icon badge | Send a bridge `badge` count from the shell page, then background the app. | The OS badge shows that count; no push token is requested or registered. |
| OS intents and quick actions | Invoke registered app quick actions and supported incoming native intents using synthetic content. | Intent resolves to the expected app/profile route or explicit unsupported fallback; content is not sent unintentionally. |
| Keyboard and compact controls | Open composer, pickers, file attachments and representative drawers with the software keyboard visible. | Safe areas, focus, dismissal and scrolling work on each tested OS; iOS drawer checks use responsive-accessibility.md. |
| Diagnostics and route errors | Open developer WebView spike and E2E reset only in their gated test build; navigate an unknown native route. | Dev-only reset/diagnostics honor their gates; invalid routes render the implemented fallback. |

## Evidence and cleanup

Record each row and platform separately with the actual entry point, observed
state, persisted side effect, and evidence. Missing hardware/service access is
a prerequisite gap, not a pass. Stop only owned sessions/processes, restore
preferences, and remove only synthetic resources after evidence is preserved.

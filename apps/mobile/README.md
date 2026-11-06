# @bb/mobile

Native iOS/Android client for bb (Expo SDK 58, React Native 0.88, Expo
Router, NativeWind v5).

Status: a native shell around the web interface (#2515). `app/webview.tsx`
loads the active server's web app in `react-native-webview` and talks to it
over `@bb/mobile-bridge` (handshake, haptics, app-icon badge, share, open
external links, open native screens, save files on iOS). Threads, projects, plugins and server
settings run in the page. The native screens cover what the page cannot
own: first-run setup by Direct URL, saved servers, This device settings
(appearance, haptics, reload the page, clear website data), the app-icon
badge, deep links, quick actions, share intents and the connection banner.
Foundry publishes no mobile builds and sends no mobile push notifications;
build the app yourself as described below.
External links use the web app's `shellOpenExternal` helper and the native
bridge to open through the OS URL handler. Application links use the version-3
`open-application` request: the shared web UI handles confirmation and saved
approvals in site-local localStorage; the native client validates the destination,
launches it, and reports opening errors back to the page. Older web pages keep the existing bridge
capabilities; no new capability enum value is advertised. The `Mobile E2E` GitHub workflow
drives the shell flows.

## Structure

```
app/                     Expo Router routes (thin: each file re-exports a screen)
  _layout.tsx            providers: GestureHandlerRootView › SafeAreaProvider ›
                         KeyboardProvider › PaletteProvider › ThemeProvider ›
                         ProfilesProvider (QueryClientProvider per profile) ›
                         SheetProvider › RootNavigator + ThreadOpenSignalHandler,
                         ShareIntentHandler, QuickActionsHandler,
                         AppBadgeSync, Toaster
  index.tsx              redirects to Add server (no profiles) or the shell
  webview.tsx            the WebView shell (`?profileId=&path=`)
  settings/              device (This device), appearance,
                         servers/index (saved servers), servers/add (Direct
                         URL form)
  dev/webview-spike.tsx  Phase 0 WebView diagnostics (dev / EXPO_PUBLIC_BB_E2E=1
                         only: release bundles redirect home)
  e2e/reset.tsx          bb://e2e/reset — wipes local state (dev / EXPO_PUBLIC_BB_E2E=1)
  +native-intent.tsx     redirectSystemPath: every incoming URL (bb:// scheme,
                         universal links, dev-client URLs) → src/lib/shell link
                         resolution → profile switch + shell route / add-server prompt
  +not-found.tsx         unknown native route fallback
src/
  app-shell/             RN glue: ProfilesProvider + hooks (useProfiles,
                         useProfileClient, useRealtimeConnectionState,
                         useConnectionBanner), useAppBoot, PaletteProvider +
                         ServerPaletteSync, client-registry (per-profile
                         clients), connector (waitForActiveConnection), e2e
                         reset wiring, ThreadOpenSignalHandler (realtime
                         `thread-open` → shell route), ShareIntentHandler,
                         QuickActionsHandler
  data/                  shared (system realtime subscription), system (system
                         config query); see src/data/README.md
  lib/                   pure TypeScript, vitest-tested
    connection/          active-profile connector (direct profiles only),
                         connection banner derivation
    e2e/                 launch/deep-link reset logic, flow boundary tests
    haptics/             haptic(kind) over expo-haptics + the preference store
    links/               incoming-link parsing, profile match, add-server path
    native/              RN adapters for the lib contracts (SecureStore,
                         cookies, AppState, the shared MMKV preferences) —
                         never imported by tested modules
    profiles/            ServerProfile model, SecureStore-backed store, URL
                         validation, /health + /system/config probe
    query/               per-profile QueryClient, AppState focus, realtime →
                         system config invalidation, session refetch
    realtime/            WebSocketManager-shaped realtime on RN WebSocket
    sdk/                 createMobileSdk (@bb/sdk/browser + app-surface header),
                         per-profile client registry
    share/               inbound share intent → shell composer seed
    shell/               shell URL and navigation rules, screen state, last-path
                         preferences, share payloads, link resolution, shell
                         commands
  notifications/         app-icon badge only: AppBadgeSync over the
                         expo-notifications badge API
  screens/               dev/ (WebViewSpikeScreen + probes), settings/ (This
                         device, Appearance, Servers, Add server, the
                         grouped-list rows), shell/ (RootNavigator, connection
                         banner, header glass, route error boundary, hrefs.ts —
                         typed-route boundary), webview/ (ProfileWebViewScreen,
                         useShellBridge)
  theme/                 generated tokens, ThemeProvider, fonts (see src/ui/README.md)
  types/                 asset declarations
  ui/                    NativeWind primitives (Text, Button, GroupedSection,
                         ActionSheet, …; see src/ui/README.md)
e2e/flows/               Maestro shell flows: shell-launch, shell-deep-link,
                         shell-send, shell-send-sidebar-swipe,
                         shell-unreachable-server
e2e/subflows/            shared steps (launch-app.yaml: cold start through the
                         dev client + Metro, or `launchApp` of the embedded
                         Release bundle with `-e BB_E2E_EMBEDDED_BUNDLE=1`;
                         pair-direct-server.yaml: add the harness server and
                         wait for the shell; open-bb-link.yaml /
                         clear-open-confirmation.yaml: accept or cancel the
                         native `bb://` confirmation), called with
                         `runFlow: ../subflows/<name>.yaml`
e2e/scripts/             ci-run-flows.sh (the CI flow set against a Release
                         build; see "CI"), ci-android-smoke.sh,
                         download-fixture.mjs, pick-simulator.mjs (newest
                         iPhone 17 Pro/17/16 Pro runtime)
scripts/                 generate-native-theme.ts (theme tokens),
                         build-android-dev.sh / build-android-local.sh (local
                         APK builds)
```

Rules: import `@bb/sdk/browser` (never `@bb/sdk`); no `@bb/shared-ui`; no DOM
APIs; keep RN-dependent code out of `src/lib/**` except `src/lib/native`.

## Prerequisites (macOS)

For Android development, install Android Studio's SDK, a current Android SDK
platform and build tools, and Java 17. Set `ANDROID_HOME` to the SDK directory
(`$HOME/Library/Android/sdk` on macOS) and add its `platform-tools` and `emulator`
directories to PATH. Start an emulator or attach an Android phone with USB
debugging enabled.

### Android local APK and verification

For development threads, build the standalone **bb dev** app from the repo root:

```bash
pnpm mobile:apk:dev
adb install -r apps/mobile/build-output/bb-dev.apk
```

The APK is `apps/mobile/build-output/bb-dev.apk`. It has an orange bb launcher
icon, favicon, and splash logo, the name **bb dev**, and package `app.getbb.mobile.dev`, so it
installs alongside the regular app with separate saved servers and data. It
embeds the Release JS bundle and runs without Metro, EAS, Firebase, or production
signing credentials. Pair it with the development server through Add server or
a pairing code. It does not claim production HTTPS app links or use the
production Firebase configuration; Android themed icons use the system tint.
Dev launcher assets tint the existing shaded mobile artwork using the orange
palette and tinting method from `apps/app/scripts/generate-pwa-icons.mjs`,
preserving the original dimensions, alpha, and launcher padding. The transparent
splash asset stores the original light logo's shading in orange RGB and uses
the dark logo's silhouette alpha. This keeps transparency at the edges rather
than throughout the shaded mark, avoiding darkening during native image
generation. Both light and dark splash screens use the orange logo.

Use `pnpm mobile:apk:dev -- x86_64` for an Intel emulator. The default is
`arm64-v8a` for a physical phone. Install Android SDK/build tools and JDK 17
first; the script detects the standard macOS SDK and Homebrew JDK 17 paths when
`ANDROID_HOME` and `JAVA_HOME` are unset. Both local commands regenerate the
gitignored Android project, so do not run them concurrently in the same checkout
or keep manual edits in `apps/mobile/android`.
Concurrent builds are rejected. If a force-killed build leaves a stale lock,
remove `apps/mobile/build-output/.android-build-lock` after confirming no build
is running, then retry.

When a thread is asked to build a dev APK, use this command, wait for successful
completion, and provide a clickable link to the resulting APK. Record the
source commit and any uncommitted changes. For a durable per-thread copy, copy
the APK into `$BB_THREAD_STORAGE` and link that absolute path. Do not publish it
to the public `android-testing` release. Builds use the generated debug signing
key; Android updates require the same key as the installed dev app.

The existing local build retains the regular app identity for smoke tests:

```bash
pnpm exec turbo run build:android:local --filter=@bb/mobile
adb install -r apps/mobile/build-output/bb-android-local.apk
```

This builds an ARM64 APK with an embedded Release JS bundle and the generated
Android debug signing key. It runs without Metro, Firebase, EAS, or production
signing credentials. It is for local testing, not Play distribution. Uninstall
it before installing an app signed with another key (which removes local app
data). For an Intel emulator, append `-- x86_64` to the Turbo command.

Run the mobile backend described below, then `adb reverse tcp:41999 tcp:41999`
so the Android app can reach it at `http://127.0.0.1:41999`. Keep the reverse
mapping active during tests. Android does not share the Mac loopback directly.

Run `pnpm exec turbo run e2e:android --filter=@bb/mobile` with only the intended
Android emulator/device connected. The smoke flow clears this app's local data,
pairs the fixture, sends a message, checks Android back navigation, relaunches,
and opens native device settings. Use a normal embedded build, not
`EXPO_PUBLIC_BB_E2E=1`, so the relaunch step can verify saved profiles.

`e2e/android/keyboard.yaml` uses the same backend and checks repeated keyboard
opening, Back dismissal, draft retention, and sending after dismissal. Run it
with `maestro test apps/mobile/e2e/android/keyboard.yaml` from the repo root.
It clears this app's local data, like the main smoke flow.

`plugins/with-selection-accent.js` sets the Android theme accent used by
WebView selection handles: blue in light mode and pale blue in dark mode.
The single insertion handle is transparent; the caret and two range-selection
handles remain visible. This applies to Android native text fields too and is
separate from the web app's CSS selection highlight.
The Expo prebuild applies it to both framework and AppCompat theme attributes.

The `react-native-webview` patch zeroes the Android IME inset before WebView
receives it. `WebViewKeyboardFrame` already resizes the native container for
the keyboard; forwarding that inset lets newer WebViews shrink the visual
viewport a second time during opening. Keep the native keyboard frame around
WebViews when using this patch. System bar and display-cutout insets remain
unchanged. Recheck this patch when upgrading WebView or changing keyboard
ownership; see [Android's inset handling guidance](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets).

The Hugeicons React Native patch restores missing SVG ellipse/polygon support
(the globe otherwise renders as a circle with a minus sign).

The cookie-library pnpm patch replaces its obsolete JCenter repository and
declares its Android namespace for current Gradle. If adding/changing a native
dependency leaves stale pnpm paths in Android autolinking, regenerate the
ignored native project before rebuilding.

The `react-native-screens` patch skips header updates for detached Android
screens, matching the fix proposed in upstream
[PR #4498](https://github.com/software-mansion/react-native-screens/pull/4498).
It addresses a release-build crash reproduced immediately after pairing on
Android 16. Recheck and remove it when upgrading to a version with the fix.

### Android release builds

Foundry has no Android release pipeline, Play listing, or Firebase push setup.
Build and sign APKs locally with the commands above.

### iOS prerequisites

- Xcode 27.1 with an iOS 27.1 simulator runtime (`xcodebuild -downloadPlatform iOS`).
- CocoaPods (`brew install cocoapods`), `export LANG=en_US.UTF-8`.
- For Maestro e2e: `brew install --cask temurin@17` or `brew install openjdk@17`
  plus `brew install mobile-dev-inc/tap/maestro`; the `e2e:ios` script sets
  `JAVA_HOME=/opt/homebrew/opt/openjdk@17` unless already set.

## Develop

```bash
pnpm install                                   # applies patches/react-native-webview@14.0.1.patch
cd apps/mobile
pnpm ios                                       # prebuild + build the dev-client, opens the simulator
EXPO_PUBLIC_BB_SERVER_URL=http://127.0.0.1:<port> pnpm dev   # Metro (dev-client)
```

The iOS Simulator shares the Mac loopback, so `pnpm dev` (repo root) or
`pnpm dev` gives a server URL that works as-is. Physical
phones need a Tailscale Serve URL or a temporary
`BB_SERVER_BIND_HOST=0.0.0.0`.

## E2E (Maestro)

```bash
# terminal 1: deterministic backend (fake provider, fixed port 41999) serving the built web app
pnpm exec turbo run build --filter=@bb/app
BB_MOBILE_E2E_SERVE_APP=1 pnpm --filter @bb/integration-tests e2e:mobile-backend
# terminal 2: Metro (EXPO_PUBLIC_BB_E2E=1 wipes profiles/preferences on every launch)
cd apps/mobile && EXPO_PUBLIC_BB_SERVER_URL=http://127.0.0.1:41999 EXPO_PUBLIC_BB_E2E=1 pnpm dev --port 8082
# terminal 3: flows
cd apps/mobile && pnpm e2e:ios
```

The flows drive the WebView shell. Maestro reads the page through the
WKWebView accessibility tree, so assertions on page content target its text,
not native test ids.
The deterministic backend marks web onboarding complete before seeding threads,
so Android and iOS shell flows start with the thread list available.
`shell-launch.yaml` pairs a Direct server from first run and lands in the
shell with the page rendered; the other shell flows assume it works.
`shell-deep-link.yaml` opens a `bb://` scheme link and a web link for the
saved server: both resolve to the shell route carrying a page path, and
`bb://settings/device` and `bb://settings/servers` still open native screens.
`shell-send.yaml` sends a message through the page and reaches the native
device settings from it.
`shell-unreachable-server.yaml` checks that the add-server probe refuses a
server the phone cannot reach, so the shell never loads a dead origin; it
does not use the harness backend.
Flows open `bb://` links through `subflows/open-bb-link.yaml` and pair through
`subflows/pair-direct-server.yaml`; `src/lib/e2e/mobile-e2e-flows.test.ts`
enforces both.
Flows dismiss the keyboard by tapping a static label ("Server URL"): Maestro's
`hideKeyboard` looks for a Return/Done key and the Add server fields use
"next".
Flows cold-start the dev client (`stopApp`) because a warm reload keeps the
last deep link as the initial URL. Without `EXPO_PUBLIC_BB_E2E=1`, open `bb://e2e/reset`
(dev builds) to return the simulator to first run.

### Flows against a Release build (no Metro)

A Release build (`npx expo run:ios --configuration Release --no-bundler
--device <udid>`) embeds the JS bundle and never starts the dev launcher, so
the same flows run without Metro: build it with `EXPO_PUBLIC_BB_E2E=1` (and
`EXPO_PUBLIC_BB_SERVER_URL=http://127.0.0.1:41999`) in the environment — the
Xcode "Bundle React Native code and images" phase inlines `EXPO_PUBLIC_*` at
bundle time — and pass `-e BB_E2E_EMBEDDED_BUNDLE=1` to Maestro.
`e2e/subflows/launch-app.yaml` switches on that variable between the
dev-client deep link and a plain `launchApp`; it is a `-e` variable on
purpose because values in a flow's `env:` block beat `-e`, and `METRO_URL`
lives in every flow's header.
`e2e/scripts/ci-run-flows.sh <udid> <artifacts dir> [flow…]` is what CI runs:
`shell-launch`, `shell-deep-link`, `shell-send`, `shell-unreachable-server`,
one `maestro test` at a time with `--test-output-dir` per flow (screenshots,
logs, JUnit); after a failure it clears the native `bb://` confirmation
before the next flow, and it exits non-zero if any flow failed. `--dev-client`
as the first argument drives a dev client through Metro instead.

## CI

- **Android emulator smoke** (`mobile-android-e2e.yml`) runs on PRs labeled
  `mobile-e2e`, on manual dispatch, and nightly. It builds a debug-key-signed
  Release APK for an Android 16 x86_64 emulator and runs the existing smoke
  flow: direct pairing, send/provider reply, Android Back, saved connection
  after relaunch, and native settings. It uses the isolated backend and needs
  no Firebase, EAS, or Play credentials. The `mobile-e2e-android` artifact
  contains screenshots, JUnit results, Maestro output, logcat, and backend logs.
  Keyboard animation is outside this basic job.

- Typecheck, lint, and unit tests run on Linux in the regular `CI` workflow
  (`pnpm exec turbo run build typecheck lint` in `Checks`, the `packages`
  test shard for `vitest`), like every workspace package.
- `.github/workflows/mobile-e2e.yml` (`Mobile E2E`) runs the flows above on
  the `blacksmith-6vcpu-macos-27` runner: label a pull request `mobile-e2e`,
  dispatch it by hand (optional `flows` input), or wait for the nightly run.
  It selects Xcode 27.1 (`DEVELOPER_DIR`; the job fails without it), boots
  the simulator `pick-simulator.mjs` chooses (an iPhone 17 on iOS 27.0),
  installs Maestro 2.8.0
  (Java 17 from `actions/setup-java` only when the image has no JDK 17+),
  restores `ios/Pods` + `Podfile.lock` and (behind the workflow's
  `CACHE_DERIVED_DATA` knob — DerivedData is ~7 GB raw and the Actions cache
  quota is shared with the Turbo caches) the Xcode DerivedData `Build/`
  directory from `actions/cache` keyed on `pnpm-lock.yaml` + `app.json` +
  `package.json` + `patches/**` and the Xcode build, prebuilds, builds the
  Release app onto the simulator, starts the harness backend (`turbo run e2e:mobile-backend`,
  waits for `/health`), runs `ci-run-flows.sh`, and uploads
  `e2e-artifacts/` (per-flow Maestro output, backend log, simulator log).

## Servers saved over bb connect

Foundry removed bb connect. A `mode: "connect"` profile saved by an older build
still parses, so the saved-server index is never rewritten, but the connector
refuses it and the app shows "bb connect is no longer supported" with an Open
Servers action. Add the server again by its direct URL; the old profile can be
removed from Settings → Servers.

## Server moves

- After `bb server move`, the old computer answers its old address with
  `410 {code:"server_moved", details:{serverUrl, toHostName}}`.
  `createMobileFetch` reads that body from `response.clone()` and validates
  `details.serverUrl` with the Direct URL rules. The registry passes the
  address with the profile ID to `createServerMovedProfileHandler`
  (`src/lib/profiles/server-moved.ts`). A direct profile gets the new
  `serverUrl`: the connector rebuilds the client, the WebView reloads, and
  a toast says "Server moved to <toHostName>". Concurrent 410 responses update
  the profile once.

## Badge and deep links

- Badge: the shell accepts a bridge `badge` message (`useShellBridge` →
  `updateAppBadgeCount`), and `AppBadgeSync` writes that count on background;
  the web app does not send it yet. Foundry registers no push token and the
  server sends no mobile push.
- Deep links: `bb://<path>` (`bb://threads/<id>`, `bb://settings/servers`,
  `bb://projects/<p>/threads/<t>`, …). `app/+native-intent.tsx` resolves every
  URL with `src/lib/shell` (`resolveShellIncomingLink` over `src/lib/links`):
  a web link whose origin matches a saved profile switches to that profile
  (waiting for its connection) and opens the shell route carrying the page
  path; native-only paths (servers, device settings) stay native; an unknown
  server opens Add server prefilled with the origin and the follow-up path.
  There are no getbb.app universal or app links. The realtime `thread-open`
  signal (`POST /threads/:id/open`, `bb thread open`) navigates to the thread
  while the app is foregrounded.

## Share sheet and haptics

- Inbound "Send to bb" is wired for `expo-share-intent` but the native module
  is **not** in the current dev client: `src/lib/share/share-intent.ts` loads
  it optionally and `src/app-shell/ShareIntentHandler.tsx` renders nothing
  when it is absent. To enable it: `npx expo install expo-share-intent`, add
  `["expo-share-intent", { "iosActivationRules": { "NSExtensionActivationSupportsText": true, "NSExtensionActivationSupportsWebURLWithMaxCount": 1 } }]`
  to `app.json` plugins, rebuild the dev client (`pnpm ios`, ~10 min, also
  reinstall it on every simulator the flows use). Shared text / URLs open
  the shell at `/?initialPrompt=`; media / file shares are declined with a
  toast.
- Outbound: the shell handles the bridge `share` request (`useShellBridge` →
  RN `Share.share`); the web app does not send it yet.
- File downloads (iOS): `saveFile` and the plugin API
  `experimental_saveFile` click ordinary download anchors, including object
  URLs for recordings and other browser-created blobs. The iOS WebView patch
  turns `shouldPerformDownload` actions and attachment/non-displayable
  responses into `WKDownload`s. WebKit writes the file in the WebView's
  request context; bb does not copy cookies, refetch through native HTTP, or
  transfer bytes through the JavaScript bridge. The patched `onFileDownload`
  event includes `filePath` for a completed local file or `error` for a
  failure, alongside the original `downloadUrl`. React Native presents the
  share sheet and deletes that download's directory after sharing, dismissal,
  or failure. Partial downloads are cancelled and removed on WebView teardown
  or page reload. Previous-process cache files are cleared on the first
  download. There are at most four active WebKit downloads. Files live under
  `Paths.cache/bb-webkit-downloads/<uuid>/`.
  The shell queries the installed binary through `nativeDownloadsSupported()`
  before enabling the new handlers, so an OTA update on an older binary keeps
  its existing behavior. The handshake advertises `nativeDownloads: true` separately from the strict
  capabilities enum, so older pages keep recognizing the shell. The page
  helper resolves `started` or `failed`; completion and share-sheet
  cancellation are handled by the shell. Older shells keep anchor behavior.
  `onOpenWindow` converts server API attachments into download anchors,
  keeps app pages in the shell, and sends other sites out. Subframes can load
  page-local previews on prefixed profiles. Android retains its existing
  download behavior. Rebuild the iOS client after changing this patch; Metro
  updates alone do not install its native download support.
- Haptics: `src/lib/haptics/` — `haptic(kind)` maps semantic kinds
  (`selection`, `impact-light|medium|heavy`, `success`, `warning`, `error`)
  onto expo-haptics and honors the Settings → This device → Haptics toggle
  (MMKV `bb.haptics.enabled`, default on). Call sites: bridge `haptic`
  messages handled in `useShellBridge` (the web app sends none yet), the
  segmented appearance picker (selection), destructive ActionSheet rows and
  confirmations (warning), the servers long-press menu (heavy), and the
  auth-required banner (warning). Screens never import expo-haptics directly.

### Native download verification

Build and install the patched iOS client, then start the normal local QA
backend from [debugging-and-qa.md](../../docs/debugging-and-qa.md). Start the
fixture proxy with its printed backend URL and an unused local port:

```bash
node apps/mobile/e2e/scripts/download-fixture.mjs http://127.0.0.1:<backend-port> <proxy-port>
```

Save both `http://127.0.0.1:<proxy-port>` and the same URL with `/bb` as
native server profiles. With each active, open `bb://api/v1/download-fixture`.
The proxy forwards normal app traffic, strips `/bb`, and also forwards root
paths, matching the web app's current root-relative API URLs.

- Authenticated file requires an HttpOnly cookie installed by the fixture
  page. The proxy logs `authorized: true` without printing cookies. A plain
  curl request without that cookie gets 401.
- Download blob generates the same 1,536,000 bytes in the page. Both files
  must match the SHA-256 printed by the fixture server and retain their names.
- Save to Files and share-sheet dismissal must leave the page intact and
  remove the corresponding `Library/Caches/bb-webkit-downloads/<uuid>/` file.
- Missing file must show a 404 toast. Redirect download must finish with the
  same bytes. Open attachment tab must open the share sheet.
- Start Slow download, then Reload page before it finishes. The proxy must
  log the interrupted connection, and its partial cache directory must be
  removed. Also check interruption by switching profiles or reloading from
  native device settings.

Cold-launch the development client for native verification.

## Release

Foundry publishes no mobile builds: there is no EAS project, TestFlight group,
Play listing, or reviewer demo server. Build the app locally (`pnpm ios`, or the
Android APK commands above) and install it on your own devices. Upstream bb's
EAS and TestFlight process is in its repository history.

## Local state

- Server profiles: `expo-secure-store`, one key per profile
  (`bb.profile.<id>`) plus `bb.profiles.index`.
- Preferences (theme mode `bb.theme`, haptics `bb.haptics.enabled`): MMKV
  store `bb.preferences`, one shared instance from
  `src/lib/native/preferences-storage.ts`. Push keys (`bb.push.*`) written by
  older builds stay in the store unread.
- Each profile owns one SDK client, one realtime socket, and one TanStack
  QueryClient (`src/lib/sdk/client-registry.ts`, instantiated once by
  `src/app-shell/client-registry.ts`); the active profile's socket lifecycle
  lives in `src/lib/connection`.

## Theme tokens

`src/theme/theme.native.ts` is generated from the web app's
`apps/app/src/components/ui/theme.css` plus the built-in palettes in
`apps/app/src/lib/themes/*.ts`: every color token per palette × light/dark as a
plain RN color string, with `nativeRadii` and the touch (`pointer: coarse`)
`nativeTypography` scale. Do not edit it by hand. After changing theme.css or a
palette, run `pnpm --filter @bb/mobile theme:generate` and commit the result;
`src/theme/generate-native-theme.test.ts` fails when the file is stale.

## Notes

- Workspace packages resolve from TypeScript source through `metro.config.js`
  (`source` export condition for `@bb/*` only, `./x.js` → `./x.ts`).
- Import `@bb/sdk/browser`, never `@bb/sdk` (lint-enforced).
- Never spread a `Headers` instance into a fetch init on React Native.
- `lightningcss` is pinned to 1.30.1 for `@expo/metro-config` (NativeWind v5).
- Type-scale line heights in `global.css` are unitless ratios
  (`calc(22 / 15)`), not px: react-native-css drops the unit inside Tailwind's
  `var(--tw-leading, …)` fallback and treats the number as an em multiplier.
- On a `ScrollView`, do not combine `contentContainerClassName` with an inline
  `contentContainerStyle`; the class styles are dropped. Use one or the other.
- `Sheet` sets `accessible={false}` on the bottom-sheet container so rows are
  reachable by VoiceOver/Maestro.
- Maestro on iOS: `back` is not a thing; tap `id: BackButton`. The dev
  client's floating gear can sit over the header's right icons on larger
  simulators.

## Android keyboard image paste

The `react-native-webview` patch receives keyboard image content through
AndroidX `InputConnectionCompat`. It is enabled only for WebViews with BB's
injected mobile bridge. The bridge captures the focused prompt editor, then
replays the image as a clipboard file through the existing web paste handler.
The WebView serves a temporary, single-use URL from the keyboard's content
stream. Image bytes stay binary instead of passing through base64 or a
JavaScript string. Reads run off the UI thread, stop at the composer's 35 MB
attachment limit, and must complete within 30 seconds. At most four transfers
can be pending per WebView. Completion, timeout, navigation, and WebView
destruction close the stream and release URI permissions. The bridge delivers
the file only after the complete body and native success confirmation arrive;
failed reads and removed or navigated editors discard the result. This requires
an updated Android APK but works with the existing web composer without a
server update.

For a device smoke test:

1. Copy a screenshot to the Android clipboard and focus a thread composer.
2. Open Gboard's clipboard panel and tap the image. Check that its attachment
   preview appears and finishes uploading.
3. Paste ordinary clipboard text and check that it still appears in the editor.
4. Paste a large image up to 35 MB and check that it completes without closing
   the app. An image above the limit must not create an attachment.
5. With a test content provider, delay one image read beyond 30 seconds, then
   paste another image. The second image must arrive while the first expires.
6. Navigate away during a delayed read and check that its result does not attach
   to another composer.
7. Remove the test attachments and text without sending a message.

Bridge regression tests run with
`pnpm exec turbo run test typecheck --filter=@bb/mobile-bridge`.

## Android message copy

For messages containing text and an image, Android Copy uses the shell's
`copyRichText` method to publish `text/plain` plus `text/html`. The HTML carries
hidden, versioned BB metadata with the exact message text and an image URL.
BB's regular Paste handler validates that metadata, inserts the text and
fetches the image from the same server with the current session. Downloads
reject redirects and non-image responses, enforce the 35 MB attachment limit,
and time out after 30 seconds. A failed download preserves the pasted text and
reports that the image could not be attached. Results from removed editors or
pages that navigated away are discarded.

Android WebView's long-press Paste delivers the HTML. Gboard's text suggestion
and clipboard-history text entries insert plain text without a rich paste
event, so those paths paste text only. BB does not compare inserted text with
previous messages or retain a copied-message cache. HTML-aware destinations
can also render the text and image reference; plain text destinations receive
only the text. The image reference requires access to the original server and
image. Copying image bytes for external image targets uses the image-only path.

Image-only messages use `copyTextAndImage` to download the image into the app
cache and expose its URI through the WebView FileProvider. Downloads are
limited to 35 MB, reject redirects, and expire after 25 seconds with 10-second
network timeouts. Old cache files are removed on the next copy after 24 hours.

Both the APK and served BB web app need this change. Older APKs retain the
previous combined image/text item behavior. Verify mixed-message Copy followed
by long-press Paste, Gboard text insertion, image-only Copy/Paste, ordinary text,
and a missing image. Remove test drafts without sending them.

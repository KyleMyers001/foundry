# Foundry app icons

The desktop app uses the Foundry Aperture artwork in `assets/foundry-aperture.png` at the repository root. That file is the original approved 1024×1024 RGB PNG, retained byte-for-byte as the source for the desktop renditions. It has no artificial rounded-square frame or baked-in corner mask.

The existing runtime and packaging paths remain unchanged:

- `apps/desktop/assets/icon.png`: stable Windows/Linux and packaged window icon.
- `apps/desktop/assets/icon-dev.png`: unpackaged development Dock/window icon.
- `apps/desktop/assets/icon-nightly.png`: nightly packaged window/Linux/Windows icon.
- `apps/desktop/assets/icon.icns`: stable macOS bundle icon.
- `apps/desktop/assets/icon-nightly.icns`: nightly macOS bundle icon.

All desktop channels currently use the same Aperture artwork without a channel badge. Product names, bundle IDs, update channels, signing and upstream legal notices are unchanged. Mobile artwork and the upstream website are outside this change. Marks that explicitly credit upstream bb plugin authors or the bb-official marketplace remain bb marks rather than being relabeled as Foundry contributions.

## Regenerate

On macOS, with Python, [uv](https://docs.astral.sh/uv/) and Apple's `iconutil` available, run from the repository root:

```sh
uv run --no-project --with pillow==12.3.0 python apps/desktop/scripts/generate_foundry_icons.py
```

PNG renditions preserve the source bytes. The generator resizes the source directly with Lanczos filtering for each standard iconset entry, then uses `iconutil` to assemble both ICNS files. No additional generation service is involved. Generated files are committed, so ordinary application builds do not require Python or uv.

## In-app and browser/PWA artwork

`apps/app/scripts/generate-pwa-icons.mjs` derives the browser and install artwork from the same approved source. Run it through the existing command:

```sh
pnpm --filter @bb/app generate:pwa-icons
```

The generated transparent `apps/app/public/foundry-mark.png` is used by `FoundryLogo` in onboarding, app update rows and application-managed skill surfaces without the upstream monochrome mark's inversion classes. Browser favicon variants use transparent glyphs so the existing color preference and unread badge compositing remain usable. Install icons retain opaque backgrounds; all eight existing color preferences and manifest paths are preserved. Monochrome install renditions use a white glyph with an alpha mask rather than an opaque square. Existing `bb` persistence keys and protocol/provider identifiers are intentionally unchanged.

## Verify

```sh
uv run --no-project --with pillow==12.3.0 python -m unittest discover -s apps/desktop/scripts -p test_foundry_icons.py -v
```

The checks pin the approved source hash, compare each desktop PNG with that source, and decode every stored macOS representation to verify its dimensions, opacity and pixels against the corresponding Lanczos resize. They do not launch the packaged application.

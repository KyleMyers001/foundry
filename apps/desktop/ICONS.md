# Foundry desktop icons

The desktop app uses the Foundry Aperture artwork in `assets/foundry-aperture.png` at the repository root. That file is the original approved 1024×1024 RGB PNG, retained byte-for-byte as the source for the desktop renditions. It has no artificial rounded-square frame or baked-in corner mask.

The existing runtime and packaging paths remain unchanged:

- `apps/desktop/assets/icon.png`: stable Windows/Linux and packaged window icon.
- `apps/desktop/assets/icon-dev.png`: unpackaged development Dock/window icon.
- `apps/desktop/assets/icon-nightly.png`: nightly packaged window/Linux/Windows icon.
- `apps/desktop/assets/icon.icns`: stable macOS bundle icon.
- `apps/desktop/assets/icon-nightly.icns`: nightly macOS bundle icon.

All channels currently use the same Aperture artwork without a channel badge. Product names, bundle IDs, update channels, signing and upstream legal notices are unchanged. Mobile artwork, browser/PWA icons, in-app upstream marks and the upstream website are outside this desktop-icon change.

## Regenerate

On macOS, with Python, [uv](https://docs.astral.sh/uv/) and Apple's `iconutil` available, run from the repository root:

```sh
uv run --no-project --with pillow==12.3.0 python apps/desktop/scripts/generate_foundry_icons.py
```

PNG renditions preserve the source bytes. The generator resizes the source directly with Lanczos filtering for each standard iconset entry, then uses `iconutil` to assemble both ICNS files. No additional generation service is involved. Generated files are committed, so ordinary application builds do not require Python or uv.

## Verify

```sh
uv run --no-project --with pillow==12.3.0 python -m unittest discover -s apps/desktop/scripts -p test_foundry_icons.py -v
```

The checks pin the approved source hash, compare each desktop PNG with that source, and decode every stored macOS representation to verify its dimensions, opacity and pixels against the corresponding Lanczos resize. They do not launch the packaged application.

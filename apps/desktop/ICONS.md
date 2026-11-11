# Foundry app icons

The desktop app uses the Monolith Midnight Amethyst artwork in `assets/foundry-monolith.png` at the repository root. The approved source remains the exact 1024×1024 RGB PNG, with midnight navy (`#080f23`) behind the amethyst mark. Its SHA-256 is `77fa064fe0046addd644ca89327737350ed3a9580a8479683f420fe4c3a6b333`.

## Platform renditions

The existing runtime and packaging paths remain unchanged:

- `apps/desktop/assets/icon.png`: byte-for-byte source for stable Windows/Linux packaging and packaged window icons.
- `apps/desktop/assets/icon-nightly.png`: byte-for-byte source for nightly Windows/Linux packaging and packaged window icons.
- `apps/desktop/assets/icon-dev.png`: transparent, rounded and padded native rendition used by the development icon path.
- `apps/desktop/assets/icon.icns`: stable macOS bundle icon, with the same native treatment.
- `apps/desktop/assets/icon-nightly.icns`: nightly macOS bundle icon, with the same native treatment.

`src/main.ts` selects the development icon when unpackaged, or when `BB_DESKTOP_DEV_ICON=1`. Only macOS explicitly passes this path to `app.dock.setIcon`; the selected PNG also supplies the window icon on every platform. Normal packaged macOS runs use their bundle's ICNS rather than overriding the Dock icon with the opaque PNG. This change does not alter those runtime decisions.

The native master has a transparent 1024×1024 canvas and an 824×824 artwork tile inset 100 pixels on each side. The tile has 184-pixel corner radii, with its alpha mask rendered at 4× resolution and downsampled with Lanczos filtering. The original artwork is uniformly resized into the tile without redrawing the mark, changing its colors, adding a badge or introducing another foreground shape. Every native size is a Lanczos resize of this same master; no separate small-size geometry is used. Outside the rounded tile is transparent, not another opaque background.

The previous desktop generator made opaque, full-bleed square renditions without native padding or rounding. That asset framing is a plausible contributor to an oversized, square-looking Dock icon, not a verified diagnosis of a running application's Dock appearance. Generated-asset checks do not establish live Dock rendering or icon-cache behavior.

All desktop channels use the same approved mark without a channel badge. Product names, bundle IDs, update channels, signing and upstream legal notices are unchanged. Mobile artwork and the upstream website are outside this change. Marks that explicitly credit upstream bb plugin authors or the bb-official marketplace remain bb marks rather than being relabeled as Foundry contributions.

## Regenerate

With Python and Pillow 12.3.0 available, run from the repository root. For an isolated invocation using [uv](https://docs.astral.sh/uv/):

```sh
uv run --no-project --with pillow==12.3.0 python apps/desktop/scripts/generate_foundry_icons.py
```

The generator preserves the two opaque PNGs as source-byte copies and derives the development PNG and both ICNS files from the native master. It renders the standard iconset at 16, 32, 128, 256 and 512 points, each at 1× and 2×, including actual 16-pixel artwork.

The ICNS container stores lossless PNG representations except for 16×16 and 32×32 at 1×, which use literal-run planar RGB data with separate alpha masks. Those legacy entries are readable by both Pillow and Apple's native exporter. This avoids relying on native `ic04`/`ic05` entries that Pillow 12.3.0 does not enumerate, or PNG payloads under small-size type codes that a native exporter may misinterpret. The focused tests independently export the finished containers with `iconutil` and compare every exported raster.

No generation service is involved. Generated files are committed, so ordinary application builds do not require Python or uv. Generation itself needs only Python and Pillow; independent native export verification requires macOS and Apple's `iconutil`.

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

The checks pin the source hash, dimensions, RGB mode and background; compare opaque PNG bytes with the source; verify development PNG corner transparency, padding and native-master pixels; and decode every actual ICNS representation with Pillow's `getimage`. Each decoded representation is checked for dimensions, transparent corners, consistent tile bounds and the intended per-size raster, including agreement between the largest ICNS image and development PNG. A scratch-tree reconstruction test deletes and regenerates outputs twice and requires identical hashes without changing the source.

On macOS, an additional test uses `iconutil -c iconset` to independently export both containers and checks every standard 1×/2× entry against the intended pixels. That test is skipped when `iconutil` is unavailable. These checks do not build, install or launch the application and do not validate an installed Dock icon.

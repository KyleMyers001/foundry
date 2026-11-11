from pathlib import Path
import shutil
import struct
from tempfile import TemporaryDirectory

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "assets/foundry-monolith.png"
ASSETS = ROOT / "apps/desktop/assets"
REPRESENTATIONS = (
    (16, 1, b"is32"),
    (16, 2, b"ic11"),
    (32, 1, b"il32"),
    (32, 2, b"ic12"),
    (128, 1, b"ic07"),
    (128, 2, b"ic13"),
    (256, 1, b"ic08"),
    (256, 2, b"ic14"),
    (512, 1, b"ic09"),
    (512, 2, b"ic10"),
)


def native_icon(source):
    tile_size = 824
    supersampling = 4
    mask_size = tile_size * supersampling
    mask = Image.new("L", (mask_size, mask_size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, mask_size - 1, mask_size - 1),
        radius=184 * supersampling,
        fill=255,
    )
    tile = source.resize((tile_size, tile_size), Image.Resampling.LANCZOS).convert("RGBA")
    tile.putalpha(mask.resize(tile.size, Image.Resampling.LANCZOS))
    icon = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    icon.paste(tile, (100, 100))
    return icon


with TemporaryDirectory(prefix="foundry-icons-") as temporary:
    iconset = Path(temporary) / "Foundry.iconset"
    iconset.mkdir()
    with Image.open(SOURCE) as source:
        master = native_icon(source)
    chunks = []
    for size, scale, kind in REPRESENTATIONS:
        pixels = size * scale
        suffix = "@2x" if scale == 2 else ""
        rendition = iconset / f"icon_{size}x{size}{suffix}.png"
        raster = master.resize((pixels, pixels), Image.Resampling.LANCZOS)
        raster.save(rendition)
        if kind in (b"is32", b"il32"):
            encoded = []
            for channel in raster.split()[:3]:
                raw = channel.tobytes()
                for offset in range(0, len(raw), 128):
                    block = raw[offset:offset + 128]
                    encoded.append(bytes((len(block) - 1,)) + block)
            data = b"".join(encoded)
            mask = raster.getchannel("A").tobytes()
            mask_kind = b"s8mk" if pixels == 16 else b"l8mk"
            chunks.append(struct.pack(">4sI", mask_kind, len(mask) + 8) + mask)
        else:
            data = rendition.read_bytes()
        chunks.append(struct.pack(">4sI", kind, len(data) + 8) + data)
    contents = b"".join(chunks)
    container = struct.pack(">4sI", b"icns", len(contents) + 8) + contents
    for name in ("icon.icns", "icon-nightly.icns"):
        (ASSETS / name).write_bytes(container)
    master.save(ASSETS / "icon-dev.png")

for name in ("icon.png", "icon-nightly.png"):
    shutil.copyfile(SOURCE, ASSETS / name)

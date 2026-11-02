from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "assets/foundry-aperture.png"
ASSETS = ROOT / "apps/desktop/assets"

with TemporaryDirectory(prefix="foundry-icons-") as temporary:
    iconset = Path(temporary) / "Foundry.iconset"
    iconset.mkdir()
    with Image.open(SOURCE) as source:
        for size in (16, 32, 128, 256, 512):
            for scale in (1, 2):
                pixels = size * scale
                suffix = "@2x" if scale == 2 else ""
                source.resize(
                    (pixels, pixels), Image.Resampling.LANCZOS
                ).save(iconset / f"icon_{size}x{size}{suffix}.png")
    container = Path(temporary) / "Foundry.icns"
    subprocess.run(
        ["iconutil", "-c", "icns", "-o", str(container), str(iconset)],
        check=True,
    )
    for name in ("icon.icns", "icon-nightly.icns"):
        shutil.copyfile(container, ASSETS / name)

for name in ("icon.png", "icon-dev.png", "icon-nightly.png"):
    shutil.copyfile(SOURCE, ASSETS / name)

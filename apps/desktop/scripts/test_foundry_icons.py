import hashlib
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from PIL import Image, ImageDraw
from PIL.IcnsImagePlugin import IcnsImageFile

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "assets/foundry-monolith.png"
ASSETS = ROOT / "apps/desktop/assets"
OUTPUTS = ("icon.png", "icon-nightly.png", "icon-dev.png", "icon.icns", "icon-nightly.icns")


class FoundryIconsTest(unittest.TestCase):
    def test_opaque_desktop_pngs_preserve_approved_monolith_artwork(self):
        self.assertEqual(
            hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            "77fa064fe0046addd644ca89327737350ed3a9580a8479683f420fe4c3a6b333",
        )
        with Image.open(SOURCE) as image:
            self.assertEqual(image.size, (1024, 1024))
            self.assertEqual(image.mode, "RGB")
            self.assertEqual(image.getpixel((0, 0)), (8, 15, 35))
        for name in ("icon.png", "icon-nightly.png"):
            with self.subTest(name=name):
                self.assertEqual((ASSETS / name).read_bytes(), SOURCE.read_bytes())

    def expected_native_raster(self, pixels):
        mask = Image.new("L", (3296, 3296), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, 3295, 3295), radius=736, fill=255
        )
        with Image.open(SOURCE) as source:
            tile = source.resize((824, 824), Image.Resampling.LANCZOS).convert("RGBA")
        tile.putalpha(mask.resize((824, 824), Image.Resampling.LANCZOS))
        master = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
        master.paste(tile, (100, 100))
        return master.resize((pixels, pixels), Image.Resampling.LANCZOS)

    def test_development_png_has_rounded_padded_native_artwork(self):
        with Image.open(ASSETS / "icon-dev.png") as actual:
            self.assertEqual(actual.size, (1024, 1024))
            self.assertEqual(actual.mode, "RGBA")
            alpha = actual.getchannel("A")
            self.assertEqual(alpha.getbbox(), (100, 100, 924, 924))
            for corner in ((0, 0), (1023, 0), (0, 1023), (1023, 1023), (100, 100)):
                self.assertEqual(alpha.getpixel(corner), 0)
            self.assertEqual(actual.getpixel((512, 100)), (8, 15, 35, 255))
            self.assertEqual(actual.tobytes(), self.expected_native_raster(1024).tobytes())

    def test_mac_icons_contain_native_monolith_at_every_resolution(self):
        expected_representations = {
            (size, size, scale)
            for size in (16, 32, 128, 256, 512)
            for scale in (1, 2)
        }
        expected_types = {
            b"is32", b"s8mk", b"ic11", b"il32", b"l8mk", b"ic12", b"ic07",
            b"ic13", b"ic08", b"ic14", b"ic09", b"ic10",
        }
        for name in ("icon.icns", "icon-nightly.icns"):
            with IcnsImageFile(ASSETS / name) as container:
                self.assertEqual(set(container.icns.dct), expected_types)
                representations = container.info["sizes"]
                self.assertEqual(set(representations), expected_representations)
                for representation in representations:
                    width, height, scale = representation
                    pixels = width * scale
                    with self.subTest(name=name, representation=representation):
                        icon = container.icns.getimage(representation).convert("RGBA")
                        self.assertEqual(icon.size, (pixels, pixels))
                        expected = self.expected_native_raster(pixels)
                        self.assertEqual(icon.tobytes(), expected.tobytes())
                        alpha = icon.getchannel("A")
                        self.assertEqual(alpha.getextrema(), (0, 255))
                        for corner in (
                            (0, 0), (pixels - 1, 0),
                            (0, pixels - 1), (pixels - 1, pixels - 1),
                        ):
                            self.assertEqual(alpha.getpixel(corner), 0)
                        bounds = alpha.point([0] * 128 + [255] * 128).getbbox()
                        if bounds is None:
                            self.fail("Native tile has no visible pixels")
                        expected_bounds = (
                            pixels * 100 / 1024, pixels * 100 / 1024,
                            pixels * 924 / 1024, pixels * 924 / 1024,
                        )
                        for edge, expected_edge in zip(bounds, expected_bounds):
                            self.assertLessEqual(abs(edge - expected_edge), 1)
                        if pixels == 1024:
                            with Image.open(ASSETS / "icon-dev.png") as development:
                                self.assertEqual(icon.tobytes(), development.tobytes())

    @unittest.skipUnless(shutil.which("iconutil"), "Requires macOS iconutil")
    def test_iconutil_independently_exports_every_native_representation(self):
        expected_entries = {
            f"icon_{size}x{size}{'@2x' if scale == 2 else ''}.png": size * scale
            for size in (16, 32, 128, 256, 512)
            for scale in (1, 2)
        }
        with TemporaryDirectory(prefix="foundry-native-export-") as temporary:
            for name in ("icon.icns", "icon-nightly.icns"):
                output = Path(temporary) / f"{Path(name).stem}.iconset"
                subprocess.run(
                    ["iconutil", "-c", "iconset", "-o", str(output), str(ASSETS / name)],
                    check=True,
                    capture_output=True,
                )
                self.assertEqual({path.name for path in output.iterdir()}, set(expected_entries))
                for filename, pixels in expected_entries.items():
                    with self.subTest(name=name, filename=filename):
                        with Image.open(output / filename) as actual:
                            self.assertEqual(actual.size, (pixels, pixels))
                            self.assertEqual(
                                actual.convert("RGBA").tobytes(),
                                self.expected_native_raster(pixels).tobytes(),
                            )

    def test_generator_reconstructs_outputs_deterministically(self):
        expected = {
            name: hashlib.sha256((ASSETS / name).read_bytes()).hexdigest()
            for name in OUTPUTS
        }
        with TemporaryDirectory(prefix="foundry-native-generation-") as temporary:
            root = Path(temporary)
            script = root / "apps/desktop/scripts/generate_foundry_icons.py"
            script.parent.mkdir(parents=True)
            shutil.copyfile(Path(__file__).with_name(script.name), script)
            source = root / "assets/foundry-monolith.png"
            source.parent.mkdir()
            shutil.copyfile(SOURCE, source)
            assets = root / "apps/desktop/assets"
            assets.mkdir()
            for iteration in range(2):
                with self.subTest(iteration=iteration):
                    subprocess.run([sys.executable, str(script)], check=True, capture_output=True)
                    self.assertEqual({path.name for path in assets.iterdir()}, set(OUTPUTS))
                    actual = {
                        name: hashlib.sha256((assets / name).read_bytes()).hexdigest()
                        for name in OUTPUTS
                    }
                    self.assertEqual(actual, expected)
                    self.assertEqual(source.read_bytes(), SOURCE.read_bytes())
                    for name in OUTPUTS:
                        (assets / name).unlink()


if __name__ == "__main__":
    unittest.main()

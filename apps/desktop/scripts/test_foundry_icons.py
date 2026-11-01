import hashlib
from pathlib import Path
import unittest

from PIL import Image
from PIL.IcnsImagePlugin import IcnsImageFile

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "assets/foundry-aperture.png"
ASSETS = ROOT / "apps/desktop/assets"


class FoundryIconsTest(unittest.TestCase):
    def test_desktop_pngs_preserve_approved_aperture_artwork(self):
        self.assertEqual(
            hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            "558794a7d257f9ce454cca148866a06428d75344bcdf800c84d49e412b32fec4",
        )
        with Image.open(SOURCE) as image:
            self.assertEqual(image.size, (1024, 1024))
            self.assertEqual(image.mode, "RGB")
        for name in ("icon.png", "icon-dev.png", "icon-nightly.png"):
            with self.subTest(name=name):
                self.assertEqual((ASSETS / name).read_bytes(), SOURCE.read_bytes())

    def test_mac_icons_contain_aperture_at_every_resolution(self):
        with Image.open(SOURCE) as source:
            for name in ("icon.icns", "icon-nightly.icns"):
                with IcnsImageFile(ASSETS / name) as container:
                    representations = container.info["sizes"]
                    self.assertEqual(
                        {width * scale for width, height, scale in representations},
                        {32, 64, 128, 256, 512, 1024},
                    )
                    for representation in representations:
                        width, height, scale = representation
                        size = (width * scale, height * scale)
                        with self.subTest(name=name, representation=representation):
                            icon = container.icns.getimage(representation)
                            expected = source.resize(size, Image.Resampling.LANCZOS)
                            self.assertEqual(icon.size, size)
                            self.assertTrue(
                                icon.convert("RGB").tobytes() == expected.tobytes(),
                                "ICNS representation differs from the Aperture source",
                            )
                            self.assertEqual(
                                icon.convert("RGBA").getchannel("A").getextrema(),
                                (255, 255),
                            )


if __name__ == "__main__":
    unittest.main()

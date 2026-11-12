import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(appDir, "public");
const sourceArtwork = await readFile(
  join(appDir, "../../assets/foundry-monolith.png"),
);
const source = await sharp(sourceArtwork)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const checkOnly = process.argv.includes("--check");

const faviconColorValues = {
  red: "#e5484d",
  orange: "#f76b15",
  yellow: "#ffba18",
  green: "#30a46c",
  teal: "#12a594",
  blue: "#0090ff",
  purple: "#8e4ec6",
  pink: "#d6409f",
};

const icons = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-192-maskable.png", 192],
  ["icon-512-maskable.png", 512],
  ["apple-touch-icon.png", 180],
];
const mismatches = [];

function extractedMark() {
  const data = Buffer.from(source.data);
  const background = source.data.subarray(0, 3);
  for (let index = 0; index < data.length; index += 4) {
    const difference = Math.max(
      Math.abs(data[index] - background[0]),
      Math.abs(data[index + 1] - background[1]),
      Math.abs(data[index + 2] - background[2]),
    );
    const coverage = Math.max(0, Math.min(1, (difference - 12) / 28));
    data[index + 3] = Math.round(data[index + 3] * coverage);
  }
  return data;
}

function tintedArtwork(mark, hex) {
  const rgb = [1, 3, 5].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16),
  );
  const data = Buffer.from(source.data);
  for (let index = 0; index < data.length; index += 4) {
    const coverage = mark[index + 3] / 255;
    const brightness =
      Math.max(data[index], data[index + 1], data[index + 2]) / 255;
    for (let channel = 0; channel < 3; channel++) {
      data[index + channel] = Math.round(
        data[index + channel] * (1 - coverage) +
          rgb[channel] * brightness * coverage,
      );
    }
  }
  return data;
}

function generatedPng(data, size = source.info.width) {
  return sharp(data, {
    raw: { width: source.info.width, height: source.info.height, channels: 4 },
  })
    .resize(size, size)
    .png()
    .toBuffer();
}

async function generatedMonochromePng(mark, size) {
  const { data, info } = await sharp(mark)
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

function generatedManifest(baseManifest, color) {
  return Buffer.from(
    `${JSON.stringify(
      {
        ...baseManifest,
        icons: baseManifest.icons.map((icon) =>
          icon.purpose === "monochrome"
            ? icon
            : {
                ...icon,
                src: icon.src.replace(/\.png$/u, `-${color}.png`),
              },
        ),
      },
      null,
      2,
    )}\n`,
  );
}

async function writeOrCheck(fileName, content) {
  const filePath = join(publicDir, fileName);
  const existing = await readFile(filePath).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing?.equals(content)) return;
  if (checkOnly) {
    mismatches.push(fileName);
    return;
  }

  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content);
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

const baseManifest = {
  ...JSON.parse(
    await readFile(join(publicDir, "manifest.webmanifest"), "utf8"),
  ),
  name: "Foundry",
  short_name: "Foundry",
};
await writeOrCheck(
  "manifest.webmanifest",
  Buffer.from(`${JSON.stringify(baseManifest, null, 2)}\n`),
);

for (const [file, size] of icons) {
  await writeOrCheck(
    file,
    await sharp(sourceArtwork).resize(size, size).png().toBuffer(),
  );
}

const markData = extractedMark();
const mark = await generatedPng(markData);
await writeOrCheck("foundry-mark.png", mark);
for (const size of [16, 32]) {
  const favicon = await sharp(mark).resize(size, size).png().toBuffer();
  for (const variant of ["", "-dark", "-dev"]) {
    await writeOrCheck(`favicon-${size}x${size}${variant}.png`, favicon);
  }
}

for (const size of [192, 512]) {
  await writeOrCheck(
    `icon-monochrome-${size}.png`,
    await generatedMonochromePng(mark, size),
  );
}

for (const [color, hex] of Object.entries(faviconColorValues)) {
  const tinted = tintedArtwork(markData, hex);
  for (const [file, size] of icons) {
    await writeOrCheck(
      file.replace(/\.png$/u, `-${color}.png`),
      await generatedPng(tinted, size),
    );
  }
  await writeOrCheck(
    `manifest-${color}.webmanifest`,
    generatedManifest(baseManifest, color),
  );
}

if (mismatches.length > 0) {
  console.error(
    [
      "Generated PWA icon assets are out of date:",
      ...mismatches.map((fileName) => `  ${fileName}`),
      "Run `pnpm --filter @bb/app generate:pwa-icons`.",
    ].join("\n"),
  );
  process.exitCode = 1;
}

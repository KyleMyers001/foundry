import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";
import { expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const appDir = resolve(import.meta.dirname, "..");
const sourcePath = resolve(appDir, "../../assets/foundry-aperture.png");
const installIcons = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-192-maskable.png", 192],
  ["icon-512-maskable.png", 512],
  ["apple-touch-icon.png", 180],
] as const;

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "bb-pwa-icons-"));
  const fixture = join(root, "apps/app");
  await mkdir(join(fixture, "scripts"), { recursive: true });
  await mkdir(join(root, "assets"));
  await cp(sourcePath, join(root, "assets/foundry-aperture.png"));
  await cp(join(appDir, "public"), join(fixture, "public"), {
    recursive: true,
  });
  const generator = join(fixture, "scripts/generate-pwa-icons.mjs");
  await cp(join(appDir, "scripts/generate-pwa-icons.mjs"), generator);
  await symlink(
    join(appDir, "node_modules"),
    join(fixture, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  return { root, fixture, generator };
}

it("regenerates opaque install icons from the unchanged approved artwork", async () => {
  const { root, fixture, generator } = await createFixture();
  try {
    await execFileAsync(process.execPath, [generator]);
    expect(
      createHash("sha256")
        .update(await readFile(sourcePath))
        .digest("hex"),
    ).toBe("558794a7d257f9ce454cca148866a06428d75344bcdf800c84d49e412b32fec4");
    for (const [file, size] of installIcons) {
      const actual = await sharp(join(fixture, "public", file))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const expected = await sharp(sourcePath)
        .resize(size, size)
        .ensureAlpha()
        .raw()
        .toBuffer();
      expect(actual.info.width).toBe(size);
      expect(actual.info.height).toBe(size);
      expect(actual.data.equals(expected), file).toBe(true);
      expect(
        actual.data.every((value, index) => index % 4 !== 3 || value === 255),
      ).toBe(true);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("extracts the approved mark into transparent glyphs instead of square alpha masks", async () => {
  const { root, fixture, generator } = await createFixture();
  try {
    await execFileAsync(process.execPath, [generator]);
    const markPath = join(fixture, "public/foundry-mark.png");
    const mark = await sharp(markPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const source = await sharp(sourcePath).ensureAlpha().raw().toBuffer();
    expect([mark.info.width, mark.info.height]).toEqual([1024, 1024]);
    const pixel = (x: number, y: number) => [
      ...mark.data.subarray((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 4),
    ];
    expect(pixel(0, 0)[3]).toBe(0);
    expect(pixel(512, 440)[3]).toBe(0);
    expect(pixel(512, 512)).toEqual([216, 138, 238, 255]);
    expect(pixel(512, 200)).toEqual([184, 104, 231, 255]);
    let solid = 0;
    let soft = 0;
    let faithful = true;
    for (let index = 0; index < mark.data.length; index += 4) {
      if (mark.data[index + 3] === 255) solid++;
      if (mark.data[index + 3] > 0 && mark.data[index + 3] < 255) soft++;
      if (
        mark.data[index + 3] > 0 &&
        !mark.data
          .subarray(index, index + 3)
          .equals(source.subarray(index, index + 3))
      )
        faithful = false;
    }
    expect(faithful).toBe(true);
    expect(solid / (1024 * 1024)).toBeGreaterThan(0.25);
    expect(solid / (1024 * 1024)).toBeLessThan(0.5);
    expect(soft).toBeGreaterThan(100);
    for (const size of [192, 512]) {
      const mono = await sharp(
        join(fixture, `public/icon-monochrome-${size}.png`),
      )
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const resized = await sharp(markPath)
        .resize(size, size)
        .ensureAlpha()
        .raw()
        .toBuffer();
      expect([mono.info.width, mono.info.height]).toEqual([size, size]);
      expect(
        mono.data.every((value, index) =>
          index % 4 === 3 ? value === resized[index] : value === 255,
        ),
      ).toBe(true);
    }
    for (const size of [16, 32]) {
      const resized = await sharp(markPath)
        .resize(size, size)
        .ensureAlpha()
        .raw()
        .toBuffer();
      for (const variant of ["", "-dark", "-dev"]) {
        const file = `favicon-${size}x${size}${variant}.png`;
        const favicon = await sharp(join(fixture, "public", file))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        expect([favicon.info.width, favicon.info.height]).toEqual([size, size]);
        expect(favicon.data.equals(resized), file).toBe(true);
        expect(favicon.data[3]).toBe(0);
        expect(
          favicon.data.some((value, index) => index % 4 === 3 && value > 200),
        ).toBe(true);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

const colorValues = {
  red: "#e5484d",
  orange: "#f76b15",
  yellow: "#ffba18",
  green: "#30a46c",
  teal: "#12a594",
  blue: "#0090ff",
  purple: "#8e4ec6",
  pink: "#d6409f",
};

it("preserves all eight color paths with dark backgrounds and shaded colored marks", async () => {
  const { root, fixture, generator } = await createFixture();
  try {
    const originalManifest = JSON.parse(
      await readFile(join(appDir, "public/manifest.webmanifest"), "utf8"),
    );
    const expectedManifest = {
      ...originalManifest,
      name: "Foundry",
      short_name: "Foundry",
    };
    await execFileAsync(process.execPath, [generator]);
    expect(
      JSON.parse(
        await readFile(join(fixture, "public/manifest.webmanifest"), "utf8"),
      ),
    ).toEqual(expectedManifest);
    for (const [color, hex] of Object.entries(colorValues)) {
      const rgb = [1, 3, 5].map((index) =>
        Number.parseInt(hex.slice(index, index + 2), 16),
      );
      for (const [file, size] of installIcons) {
        const tintedFile = file.replace(/\.png$/u, `-${color}.png`);
        const tinted = await sharp(join(fixture, "public", tintedFile))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const base = await sharp(sourcePath)
          .resize(size, size)
          .ensureAlpha()
          .raw()
          .toBuffer();
        expect([tinted.info.width, tinted.info.height]).toEqual([size, size]);
        expect([...tinted.data.subarray(0, 4)]).toEqual([
          ...base.subarray(0, 4),
        ]);
        expect(Math.max(...tinted.data.subarray(0, 3))).toBeLessThan(40);
        expect(
          tinted.data.every((value, index) => index % 4 !== 3 || value === 255),
        ).toBe(true);
        expect(tinted.data.equals(base)).toBe(false);
        const foreground =
          (Math.floor(size * 0.25) * size + Math.floor(size * 0.5)) * 4;
        for (let channel = 0; channel < 3; channel++) {
          expect(
            Math.abs(
              tinted.data[foreground + channel] -
                (rgb[channel] *
                  Math.max(...base.subarray(foreground, foreground + 3))) /
                  255,
            ),
          ).toBeLessThan(5);
        }
      }
      const manifest = JSON.parse(
        await readFile(
          join(fixture, `public/manifest-${color}.webmanifest`),
          "utf8",
        ),
      );
      expect(manifest).toEqual({
        ...expectedManifest,
        icons: expectedManifest.icons.map(
          (icon: { src: string; purpose: string }) =>
            icon.purpose === "monochrome"
              ? icon
              : { ...icon, src: icon.src.replace(/\.png$/u, `-${color}.png`) },
        ),
      });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("rebuilds missing outputs deterministically without rewriting current assets", async () => {
  const { root, fixture, generator } = await createFixture();
  try {
    const publicDir = join(fixture, "public");
    for (const file of await readdir(publicDir)) {
      if (
        file.endsWith(".png") ||
        (file.endsWith(".webmanifest") && file !== "manifest.webmanifest")
      ) {
        await rm(join(publicDir, file));
      }
    }
    await execFileAsync(process.execPath, [generator]);
    const files = [
      ...installIcons.map(([file]) => file),
      ...Object.keys(colorValues).flatMap((color) => [
        ...installIcons.map(([file]) =>
          file.replace(/\.png$/u, `-${color}.png`),
        ),
        `manifest-${color}.webmanifest`,
      ]),
      ...[16, 32].flatMap((size) =>
        ["", "-dark", "-dev"].map(
          (variant) => `favicon-${size}x${size}${variant}.png`,
        ),
      ),
      "icon-monochrome-192.png",
      "icon-monochrome-512.png",
      "foundry-mark.png",
      "manifest.webmanifest",
    ].sort();
    expect(files).toHaveLength(63);
    expect(
      (await readdir(publicDir))
        .filter((file) => /\.(png|webmanifest)$/u.test(file))
        .sort(),
    ).toEqual(files);
    const snapshot = async () =>
      Promise.all(
        files.map(async (file) => ({
          file,
          hash: createHash("sha256")
            .update(await readFile(join(publicDir, file)))
            .digest("hex"),
          modified: (await stat(join(publicDir, file))).mtimeMs,
        })),
      );
    const before = await snapshot();
    await execFileAsync(process.execPath, [generator, "--check"]);
    await execFileAsync(process.execPath, [generator]);
    expect(await snapshot()).toEqual(before);
    for (const file of [
      "icon-512.png",
      "foundry-mark.png",
      "favicon-32x32.png",
      "icon-192-blue.png",
      "manifest-pink.webmanifest",
    ]) {
      await writeFile(join(publicDir, file), "stale");
    }
    await rm(join(publicDir, "favicon-16x16.png"));
    const checked = execFileAsync(process.execPath, [generator, "--check"]);
    for (const file of [
      "icon-512.png",
      "foundry-mark.png",
      "favicon-32x32.png",
      "favicon-16x16.png",
      "icon-192-blue.png",
      "manifest-pink.webmanifest",
    ]) {
      await expect(checked).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining(file),
      });
    }
    expect(await readFile(join(publicDir, "icon-512.png"), "utf8")).toBe(
      "stale",
    );
    await execFileAsync(process.execPath, [generator]);
    await execFileAsync(process.execPath, [generator, "--check"]);
    expect(
      (await snapshot()).map(({ file, hash }) => ({ file, hash })),
    ).toEqual(before.map(({ file, hash }) => ({ file, hash })));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("checks generated icons during generation and rejects stale assets", async () => {
  const { root, fixture, generator } = await createFixture();
  try {
    await execFileAsync(process.execPath, [generator]);
    const preload = join(fixture, "pause-write.mjs");
    await writeFile(
      preload,
      `
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
const read = fs.readFile;
const write = fs.writeFile;
fs.readFile = async (path, ...rest) => {
  if (String(path).endsWith("icon-monochrome-192.png")) {
    throw Object.assign(new Error("force regeneration"), { code: "ENOENT" });
  }
  return read(path, ...rest);
};
fs.writeFile = async (path, content, ...rest) => {
  if (/icon-monochrome-192\\.png\\..+\\.tmp$/u.test(String(path))) {
    await write(path, Buffer.alloc(0));
    process.stdout.write("write-paused\\n");
    await new Promise(resolve => process.stdin.once("data", resolve));
  }
  return write(path, content, ...rest);
};
syncBuiltinESMExports();
`,
    );
    const writer = spawn(
      process.execPath,
      ["--import", pathToFileURL(preload).href, generator],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stderr = "";
    writer.stderr.on("data", (data) => {
      stderr += data;
    });
    const completed = new Promise<void>((resolve, reject) => {
      writer.once("error", reject);
      writer.once("exit", (code) => {
        if (code === 0) resolve();
        else
          reject(new Error(`Icon generation exited with ${code}: ${stderr}`));
      });
    });
    const paused = new Promise<void>((resolve) => {
      let stdout = "";
      writer.stdout.on("data", (data) => {
        stdout += data;
        if (stdout.includes("write-paused")) resolve();
      });
    });
    try {
      await Promise.race([
        paused,
        completed.then(() => {
          throw new Error(
            "Writer completed without pausing a partial temporary file",
          );
        }),
      ]);
      await execFileAsync(process.execPath, [generator, "--check"]);
    } finally {
      if (writer.exitCode === null && writer.signalCode === null) {
        writer.stdin.end("resume\n");
      }
      await completed;
    }

    await writeFile(
      join(fixture, "public/icon-monochrome-192.png"),
      "stale asset",
    );
    await expect(
      execFileAsync(process.execPath, [generator, "--check"]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("icon-monochrome-192.png"),
    });
    await execFileAsync(process.execPath, [generator]);
    await execFileAsync(process.execPath, [generator, "--check"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

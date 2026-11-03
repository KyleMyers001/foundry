import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { parse, stringify } from "yaml";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("desktop release compatibility metadata", () => {
  it.each([
    {
      platform: "darwin",
      channel: "latest",
      suffix: "mac",
      minimum: "22.0.0",
      versioned: false,
    },
    {
      platform: "darwin",
      channel: "latest",
      suffix: "mac",
      minimum: "22.0.0",
      versioned: true,
    },
    {
      platform: "darwin",
      channel: "nightly",
      suffix: "mac",
      minimum: "22.0.0",
      versioned: false,
    },
    {
      platform: "linux",
      channel: "latest",
      suffix: "linux",
      minimum: null,
      versioned: false,
    },
  ])(
    "publishes $platform $channel metadata with versioned=$versioned without losing update fields",
    async ({ platform, channel, suffix, minimum, versioned }) => {
      const root = await mkdtemp(join(tmpdir(), "bb-version-feed-test-"));
      try {
        const release = join(root, "release");
        await mkdir(release);
        await writeFile(join(root, "package.json"), '{"version":"0.43.1"}');
        const metadata = {
          version: "0.43.1",
          files: [
            { url: "bb.zip", sha512: "checksum", size: 123, blockMapSize: 42 },
          ],
          path: "bb.zip",
          sha512: "checksum",
          releaseDate: "2026-09-15T00:00:00.000Z",
          stagingPercentage: 25,
          releaseNotes: "Preserve the upstream release notes",
        };
        const metadataPath = join(release, `${channel}-${suffix}.yml`);
        await writeFile(metadataPath, stringify(metadata));
        const script = join(root, "generate.mjs");
        await build({
          entryPoints: [resolve("scripts/generate-version-feed.mts")],
          outfile: script,
          bundle: true,
          platform: "node",
          format: "esm",
          banner: {
            js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
          },
          define: { "process.platform": JSON.stringify(platform) },
        });
        await execFileAsync(
          process.execPath,
          [script, ...(versioned ? ["--versioned"] : [])],
          {
            cwd: root,
            env: { ...process.env, BB_DESKTOP_RELEASE_CHANNEL: channel },
          },
        );
        const updated: unknown = parse(await readFile(metadataPath, "utf8"));
        const assetUrl = versioned
          ? "https://github.com/KyleMyers001/foundry/releases/download/desktop-v0.43.1/bb.zip"
          : "bb.zip";
        expect(updated).toEqual({
          ...metadata,
          files: [{ ...metadata.files[0], url: assetUrl }],
          path: assetUrl,
          ...(minimum === null ? {} : { minimumSystemVersion: minimum }),
        });
        const feedName =
          platform === "darwin"
            ? "desktop-version.json"
            : "desktop-version-linux.json";
        const feed: unknown = JSON.parse(
          await readFile(join(release, feedName), "utf8"),
        );
        expect(feed).toMatchObject({
          channel,
          minimumSystemVersion: minimum,
          files: [{ url: assetUrl, sha512: "checksum", size: 123 }],
          path: assetUrl,
          version: metadata.version,
        });
        if (platform === "darwin") {
          const config: unknown = JSON.parse(
            await readFile(resolve("electron-builder.config.json"), "utf8"),
          );
          expect(config).toMatchObject({
            mac: { minimumSystemVersion: "13.0.0" },
          });
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});

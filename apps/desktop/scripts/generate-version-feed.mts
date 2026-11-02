import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import {
  bbDesktopVersionFeedSchema,
  createBbDesktopVersionFeedFileName,
  type BbDesktopVersionFeed,
} from "@bb/desktop-contract";
import {
  createDesktopReleaseConfig,
  createDesktopUpdateReleaseBaseUrl,
  resolveDesktopBuildPlatform,
  resolveDesktopReleaseChannel,
} from "./desktop-release-channel.mjs";

const { values } = parseArgs({
  options: { versioned: { type: "boolean", default: false } },
});
const packageRoot = process.cwd();
const packageJsonPath = resolve(packageRoot, "package.json");
const releaseChannel = resolveDesktopReleaseChannel(process.env);
const releaseConfig = createDesktopReleaseConfig(releaseChannel);
const buildPlatform = resolveDesktopBuildPlatform(process.platform);
const updateMetadataFileName =
  releaseConfig.updateMetadataFileNames[buildPlatform];
const updateMetadataPath = resolve(
  packageRoot,
  "release",
  updateMetadataFileName,
);
const desktopVersionFeedPath = resolve(
  packageRoot,
  "release",
  createBbDesktopVersionFeedFileName(buildPlatform),
);

const packageJsonSchema = z.object({
  version: z.string().min(1),
});

const updateMetadataFileSchema = z
  .object({
    url: z.string().min(1),
    sha512: z.string().min(1),
    size: z.number().int().nonnegative(),
  })
  .passthrough();

const updateMetadataSchema = z
  .object({
    version: z.string().min(1),
    files: z.array(updateMetadataFileSchema).min(1),
    path: z.string().min(1),
    sha512: z.string().min(1),
    releaseDate: z.iso.datetime(),
  })
  .passthrough();

function parseJson(text: string): unknown {
  return JSON.parse(text);
}

const packageJson = packageJsonSchema.parse(
  parseJson(await readFile(packageJsonPath, "utf8")),
);
let updateMetadata = updateMetadataSchema.parse(
  parseYaml(await readFile(updateMetadataPath, "utf8")),
);

if (updateMetadata.version !== packageJson.version) {
  throw new Error(
    `${updateMetadataFileName} version ${updateMetadata.version} did not match apps/desktop/package.json version ${packageJson.version}`,
  );
}

if (values.versioned) {
  const releaseBaseUrl = createDesktopUpdateReleaseBaseUrl(
    `desktop-v${packageJson.version}`,
  );
  updateMetadata = {
    ...updateMetadata,
    files: updateMetadata.files.map((file) => ({
      ...file,
      url: new URL(file.url, releaseBaseUrl).href,
    })),
    path: new URL(updateMetadata.path, releaseBaseUrl).href,
  };
}

const desktopVersionFeed: BbDesktopVersionFeed = {
  channel: releaseChannel,
  files: updateMetadata.files,
  minimumSystemVersion: buildPlatform === "macos" ? "22.0.0" : null,
  path: updateMetadata.path,
  platform: buildPlatform,
  releaseDate: updateMetadata.releaseDate,
  releaseName: `${releaseConfig.applicationName} desktop ${packageJson.version}`,
  releaseNotes: null,
  schemaVersion: 1,
  sha512: updateMetadata.sha512,
  stagingPercentage: null,
  version: packageJson.version,
};

const validatedFeed = bbDesktopVersionFeedSchema.parse(desktopVersionFeed);
if (values.versioned || validatedFeed.minimumSystemVersion !== null) {
  await writeFile(
    updateMetadataPath,
    stringifyYaml({
      ...updateMetadata,
      ...(validatedFeed.minimumSystemVersion === null
        ? {}
        : { minimumSystemVersion: validatedFeed.minimumSystemVersion }),
    }),
    "utf8",
  );
}
await writeFile(
  desktopVersionFeedPath,
  `${JSON.stringify(validatedFeed, null, 2)}\n`,
  "utf8",
);

process.stdout.write(`Wrote ${desktopVersionFeedPath}\n`);

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const sha = "a".repeat(40);
const versionTag = "desktop-v0.48.1";
const oldAssets = { "desktop-version.json": "old feed", "old.zip": "old app" };
const assets = [
  "desktop-version.json",
  "latest-mac.yml",
  "Foundry-0.48.1-arm64.dmg",
  "Foundry-0.48.1-arm64.zip",
  "Foundry-0.48.1-arm64.zip.blockmap",
];

function stepScript(name) {
  const lines = readFileSync(
    join(repoRoot, ".github/workflows/release-desktop-macos.yml"),
    "utf8",
  ).split("\n");
  const start = lines.findIndex((line) =>
    line.startsWith(`      - name: ${name}`),
  );
  const run = lines.indexOf("        run: |", start);
  if (start < 0 || run < 0) throw new Error(`Missing workflow step: ${name}`);
  let end = run + 1;
  while (
    end < lines.length &&
    (lines[end] === "" || lines[end].startsWith("          "))
  )
    end += 1;
  return lines
    .slice(run + 1, end)
    .map((line) => line.slice(10))
    .join("\n");
}

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "foundry-release-"));
  const statePath = join(root, "state.json");
  const summaryPath = join(root, "summary.md");
  const state = {
    latest: "desktop-v0.48.0",
    tags: { "desktop-v0.48.0": "b".repeat(40) },
    releases: {
      "desktop-v0.48.0": {
        isDraft: false,
        targetCommitish: "b".repeat(40),
        assets: { ...oldAssets },
      },
      "desktop-latest": {
        isDraft: false,
        targetCommitish: "b".repeat(40),
        assets: { ...oldAssets },
      },
    },
  };
  mkdirSync(join(root, "release"));
  for (const asset of assets)
    writeFileSync(join(root, "release", asset), `new ${asset}`);
  const save = () => writeFileSync(statePath, JSON.stringify(state));
  const read = () => JSON.parse(readFileSync(statePath, "utf8"));
  const execute = (step, failure = "") => {
    save();
    const result = spawnSync(
      "bash",
      [
        "-c",
        `gh() { "$TEST_NODE" "$TEST_GH" "$@"; }\ngit() { :; }\n${stepScript(step)}`,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          TEST_NODE: process.execPath,
          TEST_GH: join(
            repoRoot,
            "packages/scripts/test/fixtures/foundry-release-gh.mjs",
          ),
          RELEASE_TEST_STATE: statePath,
          GITHUB_STEP_SUMMARY: summaryPath,
          RELEASE_TEST_FAILURE: failure,
          VERSION: "0.48.1",
          GITHUB_SHA: sha,
          GITHUB_REF: "refs/heads/main",
          GITHUB_REPOSITORY: "KyleMyers001/foundry",
          MACOS_CERTIFICATE_P12: "fixture",
          MACOS_CERTIFICATE_PASSWORD: "fixture",
          APPLE_ID: "fixture",
          APPLE_APP_PASSWORD: "fixture",
          APPLE_TEAM_ID: "fixture",
        },
      },
    );
    Object.assign(state, read());
    return result;
  };
  try {
    run({ state, execute, summaryPath });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const publishStep = "Publish versioned draft";
const verifyStep = "Verify the draft release";

describe.skipIf(process.platform === "win32")(
  "Foundry desktop publication",
  () => {
    it("leaves a non-latest draft and never promotes it", () => {
      fixture(({ state, execute, summaryPath }) => {
        const published = execute(publishStep);
        expect(published.status, published.stderr).toBe(0);
        expect(state.releases[versionTag].isDraft).toBe(true);
        expect(state.latest).toBe("desktop-v0.48.0");
        expect(state.tags[versionTag]).toBeUndefined();
        expect(Object.keys(state.releases[versionTag].assets).sort()).toEqual(
          [...assets].sort(),
        );
        expect(state.releases["desktop-v0.48.0"].assets).toEqual(oldAssets);
        expect(state.releases["desktop-latest"].assets).toEqual(oldAssets);

        const verified = execute(verifyStep);
        expect(verified.status, verified.stderr).toBe(0);
        expect(readFileSync(summaryPath, "utf8")).toContain("--draft=false");
      });
    });

    it("recovers after a failed upload without damaging published assets", () => {
      fixture(({ state, execute }) => {
        const failed = execute(publishStep, "upload");
        expect(failed.status, failed.stderr).toBe(23);
        expect(state.releases[versionTag].isDraft).toBe(true);
        expect(state.latest).toBe("desktop-v0.48.0");
        expect(execute(verifyStep).status).not.toBe(0);

        const resumed = execute(publishStep);
        expect(resumed.status, resumed.stderr).toBe(0);
        expect(state.releases[versionTag].isDraft).toBe(true);
        expect(state.latest).toBe("desktop-v0.48.0");
        expect(Object.keys(state.releases[versionTag].assets).sort()).toEqual(
          [...assets].sort(),
        );
        expect(state.releases["desktop-v0.48.0"].assets).toEqual(oldAssets);
        expect(state.releases["desktop-latest"].assets).toEqual(oldAssets);
        const draft = structuredClone(state.releases[versionTag]);
        const repeated = execute(publishStep);
        expect(repeated.status, repeated.stderr).toBe(0);
        expect(state.releases[versionTag]).toEqual(draft);
        expect(execute(verifyStep).status).toBe(0);
      });
    });

    it("preserves a release that was already published from the same commit", () => {
      fixture(({ state, execute }) => {
        state.releases[versionTag] = {
          isDraft: false,
          targetCommitish: sha,
          assets: { "keep.zip": "unchanged" },
        };
        state.tags[versionTag] = sha;
        const before = structuredClone(state);
        const result = execute(publishStep);
        expect(result.status, result.stderr).toBe(0);
        expect(state).toEqual(before);
      });
    });

    it.each([true, false])(
      "rejects reusing a version from another commit (draft=%s)",
      (isDraft) => {
        fixture(({ state, execute }) => {
          state.releases[versionTag] = {
            isDraft,
            targetCommitish: "c".repeat(40),
            assets: { "keep.zip": "unchanged" },
          };
          state.tags[versionTag] = "c".repeat(40);
          const before = structuredClone(state);
          for (const step of ["Check publish preconditions", publishStep]) {
            const result = execute(step);
            expect(result.status).not.toBe(0);
            expect(state).toEqual(before);
          }
        });
      },
    );

    it.each([true, false])(
      "allows retrying the same commit (draft=%s)",
      (isDraft) => {
        fixture(({ state, execute }) => {
          state.releases[versionTag] = {
            isDraft,
            targetCommitish: sha,
            assets: {},
          };
          if (!isDraft) state.tags[versionTag] = sha;
          const result = execute("Check publish preconditions");
          expect(result.status, result.stdout + result.stderr).toBe(0);
        });
      },
    );
  },
);

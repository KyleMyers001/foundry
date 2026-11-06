import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAppVersionService,
  FOUNDRY_RELEASES_URL,
} from "../../src/services/system/app-version.js";

describe("createAppVersionService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["source", "desktop", "npm", null] as const)(
    "reports install kind %s and points at Foundry releases without contacting npm",
    async (installKind) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const service = createAppVersionService({
        sourceCommit: null,
        installKind,
        config: { appVersion: "0.0.5", isDevelopment: false },
      });

      expect(await service.getSystemVersion({ forceRefresh: true })).toEqual({
        currentCommit: null,
        installKind,
        currentVersion: "0.0.5",
        latestVersion: null,
        source: "foundry-releases",
        updateAvailable: false,
        isDevelopment: false,
        releasesUrl: FOUNDRY_RELEASES_URL,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("reports a source checkout's commit", async () => {
    const commit = "a".repeat(40);
    const service = createAppVersionService({
      sourceCommit: commit,
      installKind: "source",
      config: { appVersion: "0.0.5", isDevelopment: false },
    });

    expect((await service.getSystemVersion()).currentCommit).toBe(commit);
  });

  it("does not report another install's commit", async () => {
    const service = createAppVersionService({
      sourceCommit: "a".repeat(40),
      installKind: "npm",
      config: { appVersion: "0.0.5", isDevelopment: true },
    });

    expect(await service.getSystemVersion()).toMatchObject({
      currentCommit: null,
      isDevelopment: true,
    });
  });

  it("links to this repository's latest release", () => {
    expect(FOUNDRY_RELEASES_URL).toBe(
      "https://github.com/KyleMyers001/foundry/releases/latest",
    );
  });
});

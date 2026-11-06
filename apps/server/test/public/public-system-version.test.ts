import { afterEach, describe, expect, it, vi } from "vitest";
import type { SystemVersionResponse } from "@bb/server-contract";
import { readJson } from "../helpers/json.js";
import { withTestHarness } from "../helpers/test-app.js";

describe("GET /api/v1/system/version", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("points at Foundry releases without offering an npm update", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await withTestHarness(
      { appVersion: "0.0.5", isDevelopment: false },
      async (harness) => {
        const response = await harness.app.request(
          "/api/v1/system/version?force=true",
        );
        expect(response.status).toBe(200);
        const body = (await readJson(response)) as SystemVersionResponse;
        expect(body).toMatchObject({
          currentVersion: "0.0.5",
          isDevelopment: false,
          latestVersion: null,
          releasesUrl:
            "https://github.com/KyleMyers001/foundry/releases/latest",
          source: "foundry-releases",
          updateAvailable: false,
        });
        expect(body).not.toHaveProperty("upgradeCommand");
        expect(
          fetchSpy.mock.calls.some(([input]) =>
            String(input instanceof Request ? input.url : input).includes(
              "registry.npmjs.org",
            ),
          ),
        ).toBe(false);
      },
    );
  });
});

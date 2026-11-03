import { expect, it } from "vitest";
import { createBbSdk } from "../src/core.js";
import { createHttpTransport } from "../src/transport-http.js";

function sdkWithFetchLog() {
  const requests: string[] = [];
  const sdk = createBbSdk({
    transport: createHttpTransport({
      baseUrl: "http://bb.test",
      runtime: "node",
      fetch: async (input) => {
        requests.push(String(input));
        return Response.json({ android: null });
      },
    }),
  });
  return { requests, sdk };
}

it("refuses upstream mobile download links without contacting the server", () => {
  const { requests, sdk } = sdkWithFetchLog();
  expect(() => sdk.system.mobileAppDownloads()).toThrow(
    "system.mobileAppDownloads() is unsupported: Foundry does not publish mobile app builds.",
  );
  expect(requests).toEqual([]);
});

it("refuses the mobile release lookup without contacting the server", async () => {
  const { requests, sdk } = sdkWithFetchLog();
  await expect(sdk.system.mobileAppReleases()).rejects.toThrow(
    "system.mobileAppReleases() is unsupported: Foundry does not publish mobile app builds.",
  );
  expect(requests).toEqual([]);
});

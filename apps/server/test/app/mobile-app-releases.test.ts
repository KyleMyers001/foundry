import { afterEach, expect, it, vi } from "vitest";
import { withTestHarness } from "../helpers/test-app.js";

afterEach(() => vi.restoreAllMocks());

it("serves no upstream mobile release lookup", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  await withTestHarness(async ({ app }) => {
    const response = await app.request("/api/v1/system/mobile-app-releases");
    expect(response.status).toBe(404);
  });
  expect(
    fetchSpy.mock.calls.some(([input]) =>
      /github\.com|testflight/.test(
        String(input instanceof Request ? input.url : input),
      ),
    ),
  ).toBe(false);
});

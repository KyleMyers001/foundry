import { describe, expect, it } from "vitest";
import type { SystemAppUpdateStatus } from "@bb/server-contract";
import { readJson } from "../helpers/json.js";
import { withTestHarness } from "../helpers/test-app.js";

const API = "/api/v1/system/app-update";

describe("/api/v1/system/app-update", () => {
  it("reports in-app updates as unavailable when bb runs without the launcher shim", () =>
    withTestHarness({ isDevelopment: false }, async (harness) => {
      const response = await harness.app.request(API);

      expect(response.status).toBe(200);
      const body = (await readJson(response)) as SystemAppUpdateStatus;
      expect(body.support).toEqual({
        kind: "unsupported",
        reason: "unmanaged",
      });
      expect(body.activity).toEqual({ phase: "idle" });
      expect(body.runningThreadCount).toBe(0);
    }));

  it("refuses to apply an update the launcher cannot perform", () =>
    withTestHarness({ isDevelopment: false }, async (harness) => {
      const response = await harness.app.request(`${API}/apply`, {
        body: JSON.stringify({ confirmInterruptingThreads: true }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      expect(response.status).toBe(409);
      expect(await readJson(response)).toMatchObject({
        code: "app_update_unsupported",
      });
    }));

  it("rejects malformed apply requests", () =>
    withTestHarness(async (harness) => {
      const response = await harness.app.request(`${API}/apply`, {
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      expect(response.status).toBe(400);
    }));
});

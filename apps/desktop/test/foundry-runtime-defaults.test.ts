import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyFoundryRuntimeDefaults } from "../src/foundry-runtime-defaults.js";
import { createDesktopReleaseInfo } from "../src/desktop-update-provider.js";

describe("foundry runtime defaults", () => {
  it("keeps a packaged app away from an installed bb's data, ports, and telemetry", () => {
    const env: NodeJS.ProcessEnv = {};

    applyFoundryRuntimeDefaults({ env, homeDir: "/Users/test" });

    expect(env).toEqual({
      BB_DATA_DIR: join("/Users/test", ".foundry"),
      BB_HOST_DAEMON_PORT: "38987",
      BB_SERVER_PORT: "38986",
      BB_TELEMETRY: "false",
    });
  });

  it("respects values the user already set", () => {
    const env: NodeJS.ProcessEnv = {
      BB_DATA_DIR: "/custom",
      BB_HOST_DAEMON_PORT: "1002",
      BB_SERVER_PORT: "1001",
      BB_TELEMETRY: "true",
    };

    applyFoundryRuntimeDefaults({ env, homeDir: "/Users/test" });

    expect(env).toEqual({
      BB_DATA_DIR: "/custom",
      BB_HOST_DAEMON_PORT: "1002",
      BB_SERVER_PORT: "1001",
      BB_TELEMETRY: "true",
    });
  });

  it("treats a blank value as unset", () => {
    const env: NodeJS.ProcessEnv = { BB_SERVER_PORT: "  " };

    applyFoundryRuntimeDefaults({ env, homeDir: "/Users/test" });

    expect(env.BB_SERVER_PORT).toBe("38986");
  });
});

describe("foundry desktop identity", () => {
  it("updates from this repository under the Foundry name", () => {
    const release = createDesktopReleaseInfo("latest");

    expect(release.applicationName).toBe("Foundry");
    expect(release.updateReleaseBaseUrl).toBe(
      "https://github.com/KyleMyers001/foundry/releases/latest/download/",
    );
  });
});

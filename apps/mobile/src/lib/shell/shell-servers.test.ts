import { describe, expect, it } from "vitest";
import type { ServerProfile } from "../profiles/profile";
import { bridgeServersForProfiles, canSwitchToProfile } from "./shell-servers";

const profiles: ServerProfile[] = [
  {
    id: "retired",
    mode: "connect",
    serverUrl: "https://retired.getbb.app",
    label: "Retired",
    createdAt: 1,
    handle: "retired",
    credential: "secret-credential",
  },
  {
    id: "studio",
    mode: "direct",
    serverUrl: "https://studio.example.ts.net",
    label: "Studio",
    createdAt: 2,
  },
  {
    id: "laptop",
    mode: "direct",
    serverUrl: "http://user:password@192.168.1.4:38886/team",
    label: "Laptop",
    createdAt: 3,
  },
];

describe("shell server list", () => {
  it("offers each saved direct server by origin, never its path or login, and leaves out bb connect servers", () => {
    const servers = bridgeServersForProfiles(profiles, "laptop");
    expect(servers).toEqual([
      {
        id: "studio",
        name: "Studio",
        origin: "https://studio.example.ts.net",
        kind: "custom",
        active: false,
      },
      {
        id: "laptop",
        name: "Laptop",
        origin: "http://192.168.1.4:38886",
        kind: "custom",
        active: true,
      },
    ]);
    expect(JSON.stringify(servers)).not.toMatch(/secret|password|team/u);
  });

  it("switches only to another saved direct server", () => {
    expect(canSwitchToProfile(profiles, "laptop", "studio")).toBe(true);
    expect(canSwitchToProfile(profiles, "laptop", "laptop")).toBe(false);
    expect(canSwitchToProfile(profiles, "laptop", "retired")).toBe(false);
    expect(canSwitchToProfile(profiles, "laptop", "https://evil.example")).toBe(
      false,
    );
  });
});

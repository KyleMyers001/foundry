import { describe, expect, it } from "vitest";
import {
  buildDesktopServerChoices,
  customServerId,
} from "../src/server-list.js";
import {
  BUILTIN_SERVER_NAME,
  createServerTargetStore,
} from "../src/server-target.js";

const LOCAL_URL = "http://127.0.0.1:38886";

function createStore(saved = "") {
  return createServerTargetStore({
    storagePath: "/test/server-target.json",
    fs: {
      mkdir: async () => undefined,
      readFile: async () => saved,
      writeFile: async () => undefined,
    },
  });
}

describe("buildDesktopServerChoices", () => {
  it("lists the local server and saved direct servers by name or hostname", async () => {
    const store = createStore();
    await store.setCustomServerUrl("https://desk.example.ts.net", {
      name: "Desk",
    });
    await store.setCustomServerUrl("https://bb.example.com/team");

    expect(buildDesktopServerChoices(store, LOCAL_URL)).toEqual([
      {
        id: "builtin",
        name: BUILTIN_SERVER_NAME,
        origin: LOCAL_URL,
        kind: "local",
        active: false,
      },
      {
        id: customServerId("https://desk.example.ts.net"),
        name: "Desk",
        origin: "https://desk.example.ts.net",
        kind: "custom",
        active: false,
      },
      {
        id: customServerId("https://bb.example.com/team"),
        name: "bb.example.com",
        origin: "https://bb.example.com",
        kind: "custom",
        active: true,
      },
    ]);
  });

  it("offers the local server and saved direct servers, never the retired bb connect server, while that target is selected", async () => {
    const store = createStore(
      JSON.stringify({
        connectServer: {
          handle: "laptop",
          name: "Laptop",
          url: "https://laptop.getbb.app",
        },
        customServerUrl: "https://desk.example.ts.net",
        customServerUrls: ["https://desk.example.ts.net"],
        showBuiltinServer: false,
        target: "connect",
      }),
    );
    await store.load();

    expect(buildDesktopServerChoices(store, LOCAL_URL)).toEqual([
      {
        id: "builtin",
        name: BUILTIN_SERVER_NAME,
        origin: LOCAL_URL,
        kind: "local",
        active: false,
      },
      {
        id: customServerId("https://desk.example.ts.net"),
        name: "desk.example.ts.net",
        origin: "https://desk.example.ts.net",
        kind: "custom",
        active: false,
      },
    ]);
  });
});

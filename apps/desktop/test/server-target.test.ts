import { describe, expect, it } from "vitest";
import {
  builtinServerName,
  BUILTIN_SERVER_NAME,
  createServerTargetStore,
  normalizeCustomServerUrl,
  type ServerTargetFs,
} from "../src/server-target.js";

describe("builtinServerName", () => {
  it("uses the operating system's local server label", () => {
    expect(builtinServerName("darwin")).toBe("This Mac");
    expect(builtinServerName("linux")).toBe("This Computer");
    expect(BUILTIN_SERVER_NAME).toBe(builtinServerName(process.platform));
  });
});

function createMemoryFs(initial: Record<string, string> = {}): {
  files: Map<string, string>;
  fs: ServerTargetFs;
} {
  const files = new Map(Object.entries(initial));
  return {
    files,
    fs: {
      async mkdir() {
        return undefined;
      },
      async readFile(path) {
        const content = files.get(path);
        if (content === undefined) {
          throw new Error(`ENOENT: ${path}`);
        }
        return content;
      },
      async writeFile(path, data) {
        files.set(path, data);
      },
    },
  };
}

describe("normalizeCustomServerUrl", () => {
  it("trims, strips hashes and trailing slashes, rejects non-http", () => {
    expect(normalizeCustomServerUrl(" https://example.com/ ")).toBe(
      "https://example.com",
    );
    expect(normalizeCustomServerUrl("http://10.0.0.5:38886/#x")).toBe(
      "http://10.0.0.5:38886",
    );
    expect(normalizeCustomServerUrl("")).toBeNull();
    expect(normalizeCustomServerUrl("example.com")).toBeNull();
    expect(normalizeCustomServerUrl("file:///etc/passwd")).toBeNull();
  });
});

describe("server target store", () => {
  it("defaults to builtin when no file exists", async () => {
    const { fs } = createMemoryFs();
    const store = createServerTargetStore({ fs, storagePath: "/tmp/t.json" });
    await store.load();
    expect(store.getTarget()).toEqual({ kind: "builtin" });
    expect(store.getCustomServerUrl()).toBeNull();
  });

  it("persists a custom URL and round-trips it through load", async () => {
    const { files, fs } = createMemoryFs();
    const store = createServerTargetStore({ fs, storagePath: "/tmp/t.json" });
    await store.load();
    await store.setCustomServerUrl("https://example.com:38886");
    expect(store.getTarget()).toEqual({
      kind: "custom",
      url: "https://example.com:38886",
    });

    const reloaded = createServerTargetStore({
      fs,
      storagePath: "/tmp/t.json",
    });
    await reloaded.load();
    expect(reloaded.getTarget()).toEqual({
      kind: "custom",
      url: "https://example.com:38886",
    });
    expect(files.get("/tmp/t.json")).toContain("https://example.com:38886");
  });

  it("keeps multiple servers across selections and restarts without duplicates", async () => {
    const { fs } = createMemoryFs();
    const store = createServerTargetStore({ fs, storagePath: "/tmp/t.json" });
    await store.load();
    await store.setCustomServerUrl("https://first.example");
    await store.setCustomServerUrl("https://second.example");
    await store.setCustomServerUrl("https://first.example/#fragment");
    const reloaded = createServerTargetStore({
      fs,
      storagePath: "/tmp/t.json",
    });
    await reloaded.load();
    expect(reloaded.getCustomServerUrls()).toEqual([
      "https://first.example",
      "https://second.example",
    ]);
    expect(reloaded.getTarget()).toEqual({
      kind: "custom",
      url: "https://first.example",
    });
    await reloaded.setTarget("builtin");
    expect(reloaded.getCustomServerUrls()).toHaveLength(2);
  });

  it("migrates the legacy custom server and preserves it when adding another", async () => {
    const { fs } = createMemoryFs({
      "/tmp/t.json": JSON.stringify({
        customServerUrl: "https://old.example/",
        target: "custom",
      }),
    });
    const store = createServerTargetStore({ fs, storagePath: "/tmp/t.json" });
    await store.load();
    expect(store.getTarget()).toEqual({
      kind: "custom",
      url: "https://old.example",
    });
    await store.setCustomServerUrl("https://new.example");
    expect(store.getCustomServerUrls()).toEqual([
      "https://old.example",
      "https://new.example",
    ]);
  });

  it("edits and removes one server while preserving other saved servers", async () => {
    const { fs } = createMemoryFs();
    const store = createServerTargetStore({ fs, storagePath: "/tmp/t.json" });
    await store.load();
    await store.setCustomServerUrl("https://first.example");
    await store.setCustomServerUrl("https://second.example");
    await store.setCustomServerUrl("https://edited.example", {
      replacedUrl: "https://second.example",
    });
    expect(store.getCustomServerUrls()).toEqual([
      "https://first.example",
      "https://edited.example",
    ]);
    await expect(
      store.setCustomServerUrl("file:///bad", {
        replacedUrl: "https://edited.example",
      }),
    ).rejects.toThrow();
    expect(store.getCustomServerUrls()).toHaveLength(2);
    await store.setCustomServerUrl(null);
    expect(store.getTarget()).toEqual({ kind: "builtin" });
    expect(store.getCustomServerUrls()).toEqual(["https://first.example"]);
    const reloaded = createServerTargetStore({
      fs,
      storagePath: "/tmp/t.json",
    });
    await reloaded.load();
    expect(reloaded.getCustomServerUrls()).toEqual(["https://first.example"]);
    expect(reloaded.getTarget()).toEqual({ kind: "builtin" });
  });

  it("switches back to builtin while keeping the custom URL", async () => {
    const { fs } = createMemoryFs();
    const store = createServerTargetStore({ fs, storagePath: "/tmp/t.json" });
    await store.load();
    await store.setCustomServerUrl("https://example.com");
    expect(await store.setTarget("builtin")).toBe(true);
    expect(store.getTarget()).toEqual({ kind: "builtin" });
    expect(store.getCustomServerUrl()).toBe("https://example.com");
    expect(await store.setTarget("custom")).toBe(true);
    expect(store.getTarget()).toEqual({
      kind: "custom",
      url: "https://example.com",
    });
  });

  it("refuses to target custom without a custom URL", async () => {
    const { fs } = createMemoryFs();
    const store = createServerTargetStore({ fs, storagePath: "/tmp/t.json" });
    await store.load();
    expect(await store.setTarget("custom")).toBe(false);
    expect(store.getTarget()).toEqual({ kind: "builtin" });
  });

  const retiredConnectFile = {
    connectServer: {
      handle: "laptop",
      name: "Laptop",
      url: "https://laptop.getbb.app",
    },
    connectServerNames: { laptop: "Work laptop" },
    customServerUrl: "https://desk.example.ts.net",
    customServerUrls: ["https://desk.example.ts.net"],
    target: "connect",
  };

  it("loads a saved bb connect target as retired without offering it as a server", async () => {
    const raw = JSON.stringify(retiredConnectFile);
    const { files, fs } = createMemoryFs({ "/tmp/t.json": raw });
    const store = createServerTargetStore({ fs, storagePath: "/tmp/t.json" });
    await store.load();

    expect(store.getTarget()).toEqual({
      kind: "retired-connect",
      server: { name: "Work laptop", url: "https://laptop.getbb.app" },
    });
    expect(store.getCustomServerUrls()).toEqual([
      "https://desk.example.ts.net",
    ]);
    expect(files.get("/tmp/t.json")).toBe(raw);
  });

  it("keeps the retired bb connect target and its saved details through unrelated saves and restarts", async () => {
    const { files, fs } = createMemoryFs({
      "/tmp/t.json": JSON.stringify(retiredConnectFile),
    });
    const store = createServerTargetStore({ fs, storagePath: "/tmp/t.json" });
    await store.load();
    await store.setShowBuiltinServer(false);

    expect(JSON.parse(files.get("/tmp/t.json") ?? "")).toMatchObject({
      connectServer: retiredConnectFile.connectServer,
      connectServerNames: retiredConnectFile.connectServerNames,
      target: "connect",
    });
    const reloaded = createServerTargetStore({
      fs,
      storagePath: "/tmp/t.json",
    });
    await reloaded.load();
    expect(reloaded.getTarget().kind).toBe("retired-connect");
  });

  it.each([
    {
      name: "the local server",
      select: (store: ReturnType<typeof createServerTargetStore>) =>
        store.setTarget("builtin"),
      expected: { kind: "builtin" },
      target: "builtin",
    },
    {
      name: "a saved direct server",
      select: (store: ReturnType<typeof createServerTargetStore>) =>
        store.setCustomServerUrl("https://desk.example.ts.net"),
      expected: { kind: "custom", url: "https://desk.example.ts.net" },
      target: "custom",
    },
  ])(
    "switches from a retired bb connect target to $name and keeps the saved bb connect details",
    async ({ select, expected, target }) => {
      const { files, fs } = createMemoryFs({
        "/tmp/t.json": JSON.stringify(retiredConnectFile),
      });
      const store = createServerTargetStore({ fs, storagePath: "/tmp/t.json" });
      await store.load();
      await select(store);

      expect(store.getTarget()).toEqual(expected);
      const saved = JSON.parse(files.get("/tmp/t.json") ?? "");
      expect(saved).toMatchObject({
        connectServer: retiredConnectFile.connectServer,
        connectServerNames: retiredConnectFile.connectServerNames,
        target,
      });
      const reloaded = createServerTargetStore({
        fs,
        storagePath: "/tmp/t.json",
      });
      await reloaded.load();
      expect(reloaded.getTarget()).toEqual(expected);
    },
  );

  it("falls back to the local server, never bb connect, when the last direct server is removed", async () => {
    const { fs } = createMemoryFs({
      "/tmp/t.json": JSON.stringify({ ...retiredConnectFile, target: "custom" }),
    });
    const store = createServerTargetStore({ fs, storagePath: "/tmp/t.json" });
    await store.load();
    await store.setShowBuiltinServer(false);
    await store.setCustomServerUrl(null);

    expect(store.getTarget()).toEqual({ kind: "builtin" });
  });

  it("records a bb connect server move as retired without making it selectable", async () => {
    const { files, fs } = createMemoryFs();
    const store = createServerTargetStore({ fs, storagePath: "/tmp/t.json" });
    await store.load();
    await store.setRetiredConnectTarget({
      handle: "laptop",
      name: "Laptop",
      url: "https://laptop.getbb.app",
    });

    expect(store.getTarget()).toEqual({
      kind: "retired-connect",
      server: { name: "Laptop", url: "https://laptop.getbb.app" },
    });
    expect(store.getCustomServerUrls()).toEqual([]);
    expect(JSON.parse(files.get("/tmp/t.json") ?? "")).toMatchObject({
      connectServer: {
        handle: "laptop",
        name: "Laptop",
        url: "https://laptop.getbb.app",
      },
      target: "connect",
    });
  });

  it("falls back to builtin when the persisted file is corrupt or dangling", async () => {
    const corrupt = createServerTargetStore({
      fs: createMemoryFs({ "/tmp/t.json": "{not json" }).fs,
      storagePath: "/tmp/t.json",
    });
    await corrupt.load();
    expect(corrupt.getTarget()).toEqual({ kind: "builtin" });

    const dangling = createServerTargetStore({
      fs: createMemoryFs({
        "/tmp/t.json": JSON.stringify({
          customServerUrl: null,
          target: "custom",
        }),
      }).fs,
      storagePath: "/tmp/t.json",
    });
    await dangling.load();
    expect(dangling.getTarget()).toEqual({ kind: "builtin" });

    const danglingConnect = createServerTargetStore({
      fs: createMemoryFs({
        "/tmp/t.json": JSON.stringify({
          connectServer: null,
          customServerUrl: null,
          target: "connect",
        }),
      }).fs,
      storagePath: "/tmp/t.json",
    });
    await danglingConnect.load();
    expect(danglingConnect.getTarget()).toEqual({ kind: "builtin" });

    const invalidUrl = createServerTargetStore({
      fs: createMemoryFs({
        "/tmp/t.json": JSON.stringify({
          customServerUrl: "not-a-url",
          target: "custom",
        }),
      }).fs,
      storagePath: "/tmp/t.json",
    });
    await invalidUrl.load();
    expect(invalidUrl.getTarget()).toEqual({ kind: "builtin" });
    expect(invalidUrl.getCustomServerUrl()).toBeNull();
  });
});

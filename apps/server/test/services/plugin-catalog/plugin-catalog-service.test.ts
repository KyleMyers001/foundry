import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getInstalledPlugin,
  getPluginMarketplace,
  listPluginMarketplaceIcons,
  markInstalledPluginRemoved,
  upsertPluginMarketplace,
  upsertInstalledPlugin,
  type DbConnection,
  type PluginSourceIntent,
} from "@bb/db";
import { createMigratedConnection } from "@bb/db/testing";
import { RETIRED_COMMUNITY_MARKETPLACE_NAME } from "@bb/server-contract";
import { PLUGIN_CATALOG_CATEGORIES } from "@bb/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPluginCatalogService } from "../../../src/services/plugin-catalog/plugin-catalog-service.js";
import {
  SERVER_MOVE_FROZEN_RETRY_MS,
  setServerMoveFrozen,
} from "../../../src/services/server-move/freeze-state.js";
import { refreshMarketplace } from "../../helpers/plugin-catalog.js";
import type { MarketplaceFetch } from "../../../src/services/plugin-catalog/marketplace-http.js";
import { loadBundledMarketplace } from "../../../src/services/plugin-catalog/bundled-marketplace.js";
import {
  BUILTIN_PLUGINS,
  BUNDLED_PLUGINS,
  OFFICIAL_PLUGINS,
  listBundledPluginRegistrations,
} from "../../../src/services/plugins/builtin-registry.js";

const MANIFEST_URL = "https://marketplace.test/marketplace.json";
const ICON_URL = "https://marketplace.test/icons/widgets.svg";
const REMOTE = "acme-plugins";
const HOVER_CARDS_ENTRY = {
  id: "thread-hover-cards",
  displayName: "Thread Hover Cards",
  description: "Preview thread status from the sidebar.",
  icon: "ZoomIn",
  tags: ["interface", "threads", "sidebar"],
  author: { name: "Bersabel Tadesse", github: "brsbl" },
  source: {
    git: {
      url: "https://github.com/brsbl/bb-plugins.git",
      ref: "30f91fd977ba1ce60532af27a68534464fb62516",
    },
  },
};
const OFFICIAL_ORDER =
  loadBundledMarketplace(listBundledPluginRegistrations()).catalog
    .collections?.[0]?.pluginIds ?? [];

const VALID_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M0 0h16v16H0z"/></svg>',
);

function remoteEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "widgets",
    displayName: "Acme Widgets",
    description: "Widgets for threads.",
    icon: { url: "./icons/widgets.svg" },
    tags: ["interface", "widgets"],
    author: { name: "Acme", github: "acme" },
    source: {
      git: {
        url: "https://github.com/acme/plugins.git",
        subdir: "plugins/widgets",
        ref: "v1.0.0",
      },
    },
    ...overrides,
  };
}

function manifest(plugins: unknown[]): unknown {
  return {
    schemaVersion: 1,
    name: REMOTE,
    displayName: "Acme Plugins",
    plugins,
  };
}

function manifestV2(
  plugins: unknown[],
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    schemaVersion: 2,
    name: REMOTE,
    displayName: "Acme Plugins",
    plugins,
    ...overrides,
  };
}

describe("plugin catalog service", () => {
  let db: DbConnection;
  let installedNames: string[];
  let installedCatalogEntries: unknown[];

  let dataDir: string;

  beforeEach(async () => {
    db = createMigratedConnection();
    installedNames = [];
    installedCatalogEntries = [];
    dataDir = await mkdtemp(join(tmpdir(), "bb-catalog-data-"));
  });

  afterEach(async () => {
    db.$client.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  function service(options?: {
    bundledPlugins?: Parameters<
      typeof createPluginCatalogService
    >[0]["bundledPlugins"];
    fetch?: MarketplaceFetch;
    remoteManifest?: unknown;
    warn?: (message: string) => void;
  }) {
    if (getPluginMarketplace(db, REMOTE) === undefined) {
      upsertPluginMarketplace(db, {
        name: REMOTE,
        sourceKind: "https",
        manifestUrl: MANIFEST_URL,
        sourceGitRef: null,
        sourceGitSubdirectory: null,
        sourceGitCommit: null,
        manifestJson: JSON.stringify(options?.remoteManifest ?? manifest([])),
        statsJson: null,
        etag: null,
        lastModified: null,
        lastSuccessfulRefreshAt: null,
        lastAttemptedRefreshAt: null,
        lastError: null,
      });
    }
    return createPluginCatalogService({
      db,
      appVersion: "1.0.0",
      dataDir,
      plugins: {
        installOfficialPlugin: async (name: string) => {
          installedNames.push(name);
          throw new Error("installation stopped by test");
        },
        installCatalogPlugin: async (args: unknown) => {
          installedCatalogEntries.push(args);
          throw new Error("catalog installation stopped by test");
        },
        resolveCatalogNpmSource: async () => ({
          outcome: "unavailable" as const,
          detail: "no registry in this test",
        }),
      },
      ...(options?.bundledPlugins === undefined
        ? {}
        : { bundledPlugins: options.bundledPlugins }),
      ...(options?.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options?.warn === undefined ? {} : { warn: options.warn }),
    });
  }

  function registerInstalledOfficial(args: {
    pluginId: string;
    name: string;
  }): void {
    upsertInstalledPlugin(db, {
      id: args.pluginId,
      source: `builtin:${args.name}`,
      provenance: {
        kind: "catalog",
        marketplace: "bb-official",
        entryId: args.name,
      },
      sourceIntent: { kind: "builtin", name: args.name },
      exactResolution: { kind: "builtin" },
      updateState: {
        lastCheckAt: null,
        availableCompatibleVersion: null,
        newestIncompatibleVersion: null,
        statusDetail: null,
      },
      activeArtifactId: null,
      rootDir: `/bundled/${args.name}`,
      version: "0.0.1",
      enabled: true,
      enabledFollowsDefault: false,
    });
  }

  it("lists bundled plugins and no upstream community catalog", async () => {
    const catalog = service();
    expect(catalog.status()).toEqual({
      pluginCount: BUNDLED_PLUGINS.length,
      includedPluginCount: BUILTIN_PLUGINS.length,
      optionalPluginCount: OFFICIAL_PLUGINS.length,
    });

    const results = await catalog.search("");
    expect(results.map((entry) => entry.entryId).sort()).toEqual(
      BUNDLED_PLUGINS.map((plugin) => plugin.name).sort(),
    );
    const docs = results.find((entry) => entry.entryId === "docs");
    expect(docs).toMatchObject({
      pluginId: "simple-notes",
      displayName: "Docs",
      icon: "FileText",
      iconUrl: null,
      category: "File Viewers & Editors",
      screenshots: [
        "https://getbb.app/marketplace/v2/screenshots/docs/docs-21ddb6757-inline-review-desktop.png",
        "https://getbb.app/marketplace/v2/screenshots/docs/docs-f4957b72f-inline-editing-desktop.png",
        "https://getbb.app/marketplace/v2/screenshots/docs/docs-f4957b72f-ask-mobile.png",
        "https://getbb.app/marketplace/v2/screenshots/docs/docs-63b536e70-workspace-desktop.png",
        "https://getbb.app/marketplace/v2/screenshots/docs/docs-21ddb6757-html-desktop.png",
        "https://getbb.app/marketplace/v2/screenshots/docs/docs-21ddb6757-vault-desktop.png",
      ],
      collections: [
        { id: "bb-official", rank: OFFICIAL_ORDER.indexOf("simple-notes") },
      ],
      source: "builtin:docs",
      marketplace: "bb-official",
      marketplaceDisplayName: "BB Official",
      publisherKey: "bb-official",
      publisherLabel: "BB Official",
      author: { name: "BB", url: null },
      installed: false,
      installedByDefault: false,
      compatible: true,
    });
    expect(
      Object.fromEntries(
        results.map((entry) => [entry.entryId, entry.installedByDefault]),
      ),
    ).toEqual(
      Object.fromEntries(
        BUNDLED_PLUGINS.map((plugin) => [plugin.name, plugin.autoInstall]),
      ),
    );
    expect(
      catalog.listMarketplaces().map((marketplace) => marketplace.name),
    ).toEqual(["bb-official", REMOTE]);
    expect(catalog.collections()).toEqual([
      {
        id: "bb-official",
        displayName: "BB Official",
        pluginIds: OFFICIAL_ORDER,
      },
    ]);
    for (const category of PLUGIN_CATALOG_CATEGORIES) {
      const categoryNames = results
        .filter((entry) => entry.category === category.displayName)
        .map((entry) => entry.displayName);
      expect(categoryNames).toEqual(
        [...categoryNames].sort((a, b) => a.localeCompare(b)),
      );
    }
  });

  it("matches queries against entry id, plugin id, manifest text, and tags", async () => {
    const catalog = service();
    expect(
      (await catalog.search("docs")).map((entry) => entry.entryId),
    ).toContain("docs");
    expect(
      (await catalog.search("simple-notes")).map((entry) => entry.entryId),
    ).toEqual(["docs"]);
    expect(await catalog.search("no-such-plugin")).toEqual([]);
  });

  it("reflects install and remove in the installed flag", async () => {
    const catalog = service();
    registerInstalledOfficial({ pluginId: "simple-notes", name: "docs" });
    expect((await catalog.search("docs"))[0]?.installed).toBe(true);

    markInstalledPluginRemoved(db, "simple-notes");
    expect((await catalog.search("docs"))[0]?.installed).toBe(false);
  });

  it("delegates install to the plugin service by bundled name", async () => {
    const catalog = service();
    await expect(catalog.install({ entryId: "docs" })).rejects.toThrow(
      "installation stopped by test",
    );
    expect(installedNames).toEqual(["docs"]);
  });

  it("drops entries whose bundled manifest is unreadable", async () => {
    const missingRoot = await mkdtemp(join(tmpdir(), "bb-missing-plugin-"));
    await rm(missingRoot, { recursive: true, force: true });
    const warnings: string[] = [];
    const registrations = listBundledPluginRegistrations();
    const github = registrations.find((plugin) => plugin.name === "github");
    const workflows = registrations.find(
      (plugin) => plugin.name === "workflows",
    );
    if (github === undefined || workflows === undefined) {
      throw new Error("bundled registration missing");
    }
    const catalog = service({
      bundledPlugins: [
        {
          ...github,
          rootDir: missingRoot,
        },
        workflows,
      ],
      warn: (message) => warnings.push(message),
    });
    const results = await catalog.search("");
    expect(results.map((entry) => entry.entryId)).not.toContain("github");
    expect(results.map((entry) => entry.entryId)).toContain("workflows");
    expect(warnings.some((warning) => warning.includes("github"))).toBe(true);
  });

  it("serves a bundled entry's own compact icon from the catalog route", async () => {
    const registrations = listBundledPluginRegistrations();
    const withSvg = registrations.find(
      (plugin) => plugin.name === "provider-acp",
    );
    const withGlyph = registrations.find(
      (plugin) => plugin.name === "workflows",
    );
    if (withSvg === undefined || withGlyph === undefined) {
      throw new Error("expected bundled registrations");
    }
    const catalog = service({ bundledPlugins: [withSvg, withGlyph] });

    const results = await catalog.search("");
    const svgEntry = results.find((entry) => entry.entryId === withSvg.name);
    const glyphEntry = results.find(
      (entry) => entry.entryId === withGlyph.name,
    );
    expect(svgEntry?.icon?.startsWith("./")).toBe(true);
    const icon = await catalog.icon("bb-official", withSvg.name);
    expect(icon?.contentType).toBe("image/svg+xml");
    expect(svgEntry?.iconUrl).toBe(
      `/api/v1/plugin-catalog/icons/bb-official/${withSvg.name}?h=${icon?.hash}`,
    );
    expect(new TextDecoder().decode(icon?.bytes)).toContain("<svg");
    expect(svgEntry?.iconTinted).toBe(true);

    expect(glyphEntry?.iconUrl).toBeNull();
    expect(glyphEntry?.iconTinted).toBe(false);
    expect(await catalog.icon("bb-official", withGlyph.name)).toBeUndefined();
  });

  describe("refresh", () => {
    it("projects a user catalog's v2 categories, screenshots, and dates, but not its collections", async () => {
      const catalog = service({
        fetch: async (url) =>
          url === MANIFEST_URL
            ? Response.json(
                manifestV2(
                  [
                    remoteEntry({
                      icon: "Zap",
                      author: {
                        name: "Acme",
                        github: "acme",
                        url: "https://acme.dev",
                      },
                      category: "acme-tools",
                      screenshots: ["./screenshots/widgets/widgets.webp"],
                      overview: "# Widgets\n\nLong-form text.\n",
                      publishedAt: "2026-08-20T11:47:04-07:00",
                      updatedAt: "2026-08-27T16:12:00Z",
                    }),
                    remoteEntry({
                      id: "uncategorized",
                      icon: "Zap",
                      category: "missing-category",
                      overview: `${"a".repeat(4001)}\n`,
                    }),
                  ],
                  {
                    categories: [
                      {
                        id: "acme-tools",
                        displayName: "Acme tools",
                        description: "Tools from Acme.",
                      },
                    ],
                    collections: [
                      {
                        id: "new-and-notable",
                        displayName: "New & notable",
                        pluginIds: ["missing-plugin", "widgets"],
                      },
                    ],
                  },
                ),
              )
            : new Response(null, { status: 404 }),
      });

      await refreshMarketplace(catalog, REMOTE, 1_000);
      const widgets = (await catalog.search("widgets")).find(
        (entry) => entry.entryId === "widgets",
      );
      expect(widgets).toMatchObject({
        author: {
          name: "Acme",
          github: "acme",
          url: "https://acme.dev",
        },
        categoryId: "acme-tools",
        category: "Acme tools",
        screenshots: [
          "https://marketplace.test/screenshots/widgets/widgets.webp",
        ],
        overview: "# Widgets\n\nLong-form text.\n",
        collections: [],
        publishedAt: "2026-08-20T11:47:04-07:00",
        updatedAt: "2026-08-27T16:12:00Z",
      });
      const uncategorized = (await catalog.search("uncategorized"))[0];
      expect(uncategorized).not.toHaveProperty("categoryId");
      expect(uncategorized).not.toHaveProperty("category");
      expect(uncategorized).not.toHaveProperty("overview");
      expect(uncategorized?.collections).toEqual([]);
      expect(catalog.collections()).toEqual([
        {
          id: "bb-official",
          displayName: "BB Official",
          pluginIds: OFFICIAL_ORDER,
        },
      ]);
      expect(catalog.categories().map((category) => category.id)).toEqual(
        PLUGIN_CATALOG_CATEGORIES.map((category) => category.id),
      );
    });

    it("ignores collections from a third-party marketplace", async () => {
      const catalog = service();
      upsertPluginMarketplace(db, {
        name: "acme",
        sourceKind: "path",
        manifestUrl: dataDir,
        sourceGitRef: null,
        sourceGitSubdirectory: null,
        sourceGitCommit: null,
        manifestJson: JSON.stringify(
          manifestV2([remoteEntry({ icon: "Zap" })], {
            name: "acme",
            displayName: "Acme",
            collections: [
              {
                id: "featured",
                displayName: "Featured",
                pluginIds: ["widgets"],
              },
            ],
          }),
        ),
        statsJson: null,
        etag: null,
        lastModified: null,
        lastSuccessfulRefreshAt: 1_000,
        lastAttemptedRefreshAt: 1_000,
        lastError: null,
      });

      expect((await catalog.search("widgets"))[0]?.collections).toEqual([]);
      expect(catalog.collections()).toEqual([
        {
          id: "bb-official",
          displayName: "BB Official",
          pluginIds: OFFICIAL_ORDER,
        },
      ]);
    });

    it("keeps a stored bb-community catalog without listing, searching, refreshing, or installing from it until it is removed", async () => {
      const stored = {
        name: RETIRED_COMMUNITY_MARKETPLACE_NAME,
        sourceKind: "https" as const,
        manifestUrl: "https://getbb.app/marketplace/v2/marketplace.json",
        sourceGitRef: null,
        sourceGitSubdirectory: null,
        sourceGitCommit: null,
        manifestJson: JSON.stringify({
          schemaVersion: 2,
          name: RETIRED_COMMUNITY_MARKETPLACE_NAME,
          displayName: "BB Community",
          plugins: [remoteEntry({ id: "community-widgets", icon: "Zap" })],
          collections: [
            { id: "bb-official", displayName: "Duplicate", pluginIds: [] },
          ],
        }),
        statsJson: null,
        etag: null,
        lastModified: null,
        lastSuccessfulRefreshAt: 1_000,
        lastAttemptedRefreshAt: 1_000,
        lastError: null,
      };
      upsertPluginMarketplace(db, stored);
      const fetched: string[] = [];
      const catalog = service({
        fetch: async (url) => {
          fetched.push(url);
          return new Response(null, { status: 503 });
        },
      });

      expect(
        catalog.listMarketplaces().map((marketplace) => marketplace.name),
      ).not.toContain(RETIRED_COMMUNITY_MARKETPLACE_NAME);
      expect(await catalog.search("community-widgets")).toEqual([]);
      await expect(
        catalog.refreshMarketplaces({ name: RETIRED_COMMUNITY_MARKETPLACE_NAME }),
      ).rejects.toThrow('unknown marketplace "bb-community"');
      await expect(
        catalog.install({
          entryId: "community-widgets",
          marketplace: RETIRED_COMMUNITY_MARKETPLACE_NAME,
        }),
      ).rejects.toThrow('unknown marketplace "bb-community"');
      await catalog.refreshMarketplaces();
      expect(fetched).not.toContain(stored.manifestUrl);
      expect(getPluginMarketplace(db, RETIRED_COMMUNITY_MARKETPLACE_NAME)).toMatchObject(
        { manifestJson: stored.manifestJson, lastAttemptedRefreshAt: 1_000 },
      );

      upsertInstalledPlugin(db, {
        id: "community-widgets",
        source: "npm:bb-plugin-community-widgets@^1.0.0",
        provenance: {
          kind: "catalog",
          marketplace: RETIRED_COMMUNITY_MARKETPLACE_NAME,
          entryId: "community-widgets",
        },
        sourceIntent: {
          kind: "npm",
          packageName: "bb-plugin-community-widgets",
          registry: "https://registry.npmjs.org/",
          requestedSpec: "^1.0.0",
          specKind: "range",
        },
        exactResolution: {
          kind: "npm",
          version: "1.0.0",
          integrity: "sha512-community",
        },
        updateState: {
          lastCheckAt: null,
          availableCompatibleVersion: null,
          newestIncompatibleVersion: null,
          statusDetail: null,
        },
        activeArtifactId: null,
        rootDir: "/plugins/community-widgets",
        version: "1.0.0",
        enabled: true,
        enabledFollowsDefault: false,
      });
      await expect(
        catalog.removeMarketplace(RETIRED_COMMUNITY_MARKETPLACE_NAME),
      ).resolves.toEqual({ convertedPluginIds: ["community-widgets"] });
      expect(getPluginMarketplace(db, RETIRED_COMMUNITY_MARKETPLACE_NAME)).toBe(
        undefined,
      );
      expect(getInstalledPlugin(db, "community-widgets")).toMatchObject({
        provenance: "direct",
        catalogEntryId: null,
        catalogMarketplaceName: null,
        sourceKind: "npm",
        enabled: true,
      });
      await expect(
        catalog.removeMarketplace(RETIRED_COMMUNITY_MARKETPLACE_NAME),
      ).rejects.toThrow('unknown marketplace "bb-community"');
    });

    it("tints a catalog SVG but keeps a raster icon's own colors", async () => {
      const PNG = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
      ]);
      const fetchImpl: MarketplaceFetch = async (url) => {
        if (url === MANIFEST_URL) {
          return Response.json(
            manifest([
              remoteEntry({
                id: "raster",
                icon: { url: "./icons/raster.png" },
              }),
              remoteEntry({ id: "glyph", icon: { url: "./icons/glyph.svg" } }),
            ]),
          );
        }
        return url.endsWith(".png")
          ? new Response(PNG, {
              status: 200,
              headers: { "content-type": "image/png" },
            })
          : new Response(VALID_SVG, {
              status: 200,
              headers: { "content-type": "image/svg+xml" },
            });
      };
      const catalog = service({ fetch: fetchImpl });

      await refreshMarketplace(catalog, REMOTE, 1_000);
      const tinted = Object.fromEntries(
        (await catalog.search("")).map((entry) => [
          entry.entryId,
          { iconUrl: entry.iconUrl !== null, iconTinted: entry.iconTinted },
        ]),
      );
      expect(tinted).toMatchObject({
        raster: { iconUrl: true, iconTinted: false },
        glyph: { iconUrl: true, iconTinted: true },
      });
    });

    it("replaces the catalog, caches icons, and revalidates with the ETag", async () => {
      const requests: Array<{ url: string; headers: Headers }> = [];
      const fetchImpl: MarketplaceFetch = async (url, init) => {
        requests.push({ url, headers: new Headers(init.headers) });
        if (url === MANIFEST_URL) {
          return requests.filter((request) => request.url === MANIFEST_URL)
            .length === 1
            ? Response.json(manifest([remoteEntry()]), {
                headers: { etag: '"v1"' },
              })
            : new Response(null, { status: 304 });
        }
        return new Response(VALID_SVG, {
          status: 200,
          headers: { "content-type": "image/svg+xml", etag: '"icon-1"' },
        });
      };
      const catalog = service({ fetch: fetchImpl });

      await refreshMarketplace(catalog, REMOTE, 1_000);
      const results = await catalog.search("widgets");
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        entryId: "widgets",
        displayName: "Acme Widgets",
        category: "Interface",
        icon: null,
        source:
          "git:https://github.com/acme/plugins.git@v1.0.0#plugins/widgets",
      });
      expect(results[0]?.iconUrl).toBe(
        "/api/v1/plugin-catalog/icons/acme-plugins/widgets?h=" +
          (await catalog.icon(REMOTE, "widgets"))?.hash,
      );
      expect(await catalog.icon(REMOTE, "widgets")).toMatchObject({
        contentType: "image/svg+xml",
      });
      expect(results[0]?.iconTinted).toBe(true);
      expect(requests[1]?.url).toBe(ICON_URL);

      await refreshMarketplace(catalog, REMOTE, 2_000);
      const conditional = requests.filter(
        (request) => request.url === MANIFEST_URL,
      )[1];
      expect(conditional?.headers.get("if-none-match")).toBe('"v1"');
      expect((await catalog.search("widgets"))[0]?.displayName).toBe(
        "Acme Widgets",
      );
      expect(
        requests.filter((request) => request.url === ICON_URL),
      ).toHaveLength(1);
      const row = getPluginMarketplace(db, REMOTE);
      expect(row).toMatchObject({
        etag: '"v1"',
        lastSuccessfulRefreshAt: 2_000,
        lastError: null,
      });
    });

    it("keeps the last-known-good catalog when the payload is invalid", async () => {
      const catalog = service({
        remoteManifest: manifest([remoteEntry({ icon: "Zap" })]),
        fetch: async () =>
          Response.json(manifest([remoteEntry({ id: "Not Valid" })])),
      });
      await expect(refreshMarketplace(catalog, REMOTE, 5_000)).rejects.toThrow(
        /invalid marketplace manifest/,
      );
      expect((await catalog.search("widgets")).length).toBe(1);
      expect(getPluginMarketplace(db, REMOTE)).toMatchObject({
        lastAttemptedRefreshAt: 5_000,
        lastSuccessfulRefreshAt: null,
      });
      expect(getPluginMarketplace(db, REMOTE)?.lastError).toMatch(
        /invalid marketplace manifest/,
      );
    });

    it("keeps the last-known-good catalog when the request fails", async () => {
      const catalog = service({
        fetch: async () => new Response("nope", { status: 503 }),
      });
      await expect(refreshMarketplace(catalog, REMOTE, 7_000)).rejects.toThrow(
        "HTTP 503",
      );
      expect((await catalog.search("")).length).toBe(
        BUNDLED_PLUGINS.length,
      );
      expect(getPluginMarketplace(db, REMOTE)?.lastError).toContain(
        "HTTP 503",
      );
    });

    it("refuses a manifest published under another marketplace name", async () => {
      const catalog = service({
        fetch: async () =>
          Response.json({
            ...(manifest([remoteEntry()]) as Record<string, unknown>),
            name: "someone-else",
          }),
      });
      await expect(refreshMarketplace(catalog, REMOTE, 9_000)).rejects.toThrow(
        /someone-else/,
      );
      expect((await catalog.search("widgets")).length).toBe(0);
    });

    it("keeps an entry whose icon fails validation and warns", async () => {
      const warnings: string[] = [];
      const catalog = service({
        warn: (message) => warnings.push(message),
        fetch: async (url) =>
          url === MANIFEST_URL
            ? Response.json(manifest([remoteEntry()]))
            : new Response(Buffer.from("<html>not an icon</html>"), {
                status: 200,
              }),
      });
      await refreshMarketplace(catalog, REMOTE, 1_000);
      const [entry] = await catalog.search("widgets");
      expect(entry).toMatchObject({ entryId: "widgets", iconUrl: null });
      expect(await catalog.icon(REMOTE, "widgets")).toBeUndefined();
      expect(warnings.some((warning) => warning.includes("widgets"))).toBe(
        true,
      );
    });

    it("refuses an icon larger than the cap", async () => {
      const warnings: string[] = [];
      const catalog = service({
        warn: (message) => warnings.push(message),
        fetch: async (url) =>
          url === MANIFEST_URL
            ? Response.json(manifest([remoteEntry()]))
            : new Response(Buffer.alloc(300 * 1024, 0x41), { status: 200 }),
      });
      await refreshMarketplace(catalog, REMOTE, 1_000);
      expect(await catalog.icon(REMOTE, "widgets")).toBeUndefined();
      expect(
        warnings.some((warning) => warning.includes("exceeds 262144 bytes")),
      ).toBe(true);
    });

    it("keeps cached icons while retrying a missing one on a 304", async () => {
      let iconRequests = 0;
      let failFirstIcon = true;
      const catalog = service({
        warn: () => {},
        fetch: async (url) => {
          if (url === MANIFEST_URL) {
            return iconRequests === 0
              ? Response.json(
                  manifest([
                    remoteEntry(),
                    remoteEntry({
                      id: "gadgets",
                      icon: { url: "./icons/gadgets.svg" },
                    }),
                  ]),
                  { headers: { etag: '"v1"' } },
                )
              : new Response(null, { status: 304 });
          }
          iconRequests += 1;
          if (url.endsWith("gadgets.svg") && failFirstIcon) {
            failFirstIcon = false;
            return new Response("boom", { status: 500 });
          }
          return new Response(VALID_SVG, { status: 200 });
        },
      });
      await refreshMarketplace(catalog, REMOTE, 1_000);
      expect(await catalog.icon(REMOTE, "widgets")).toBeDefined();
      expect(await catalog.icon(REMOTE, "gadgets")).toBeUndefined();

      await refreshMarketplace(catalog, REMOTE, 2_000);
      expect(await catalog.icon(REMOTE, "widgets")).toBeDefined();
      expect(await catalog.icon(REMOTE, "gadgets")).toBeDefined();
    });

    it("drops a cached icon the refreshed manifest no longer lists", async () => {
      let listIcon = true;
      const catalog = service({
        fetch: async (url) =>
          url === MANIFEST_URL
            ? Response.json(
                manifest([
                  listIcon ? remoteEntry() : remoteEntry({ icon: "Zap" }),
                ]),
              )
            : new Response(VALID_SVG, { status: 200 }),
      });
      await refreshMarketplace(catalog, REMOTE, 1_000);
      expect(await catalog.icon(REMOTE, "widgets")).toBeDefined();
      listIcon = false;
      await refreshMarketplace(catalog, REMOTE, 2_000);
      expect(await catalog.icon(REMOTE, "widgets")).toBeUndefined();
    });

    it("drops a cached icon when its replacement URL fails", async () => {
      let iconUrl = "./icons/widgets.svg";
      const catalog = service({
        warn: () => {},
        fetch: async (url) => {
          if (url === MANIFEST_URL) {
            return Response.json(
              manifest([remoteEntry({ icon: { url: iconUrl } })]),
            );
          }
          return url.endsWith("widgets.svg")
            ? new Response(VALID_SVG, { status: 200 })
            : new Response("nope", { status: 503 });
        },
      });
      await refreshMarketplace(catalog, REMOTE, 1_000);
      expect(await catalog.icon(REMOTE, "widgets")).toBeDefined();

      iconUrl = "./icons/replacement.svg";
      await refreshMarketplace(catalog, REMOTE, 2_000);
      expect(await catalog.icon(REMOTE, "widgets")).toBeUndefined();
    });

    it("keeps the prior snapshot when an icon-table commit fails", async () => {
      db.$client.exec(`
        CREATE TRIGGER reject_marketplace_icon
        BEFORE INSERT ON plugin_marketplace_icons
        BEGIN
          SELECT RAISE(ABORT, 'icon write failed');
        END;
      `);
      const catalog = service({
        fetch: async (url) =>
          url === MANIFEST_URL
            ? Response.json(manifest([remoteEntry()]))
            : new Response(VALID_SVG, { status: 200 }),
      });

      await expect(refreshMarketplace(catalog, REMOTE, 3_000)).rejects.toThrow(
        "icon write failed",
      );
      expect(await catalog.search("widgets")).toEqual([]);
      expect(getPluginMarketplace(db, REMOTE)).toMatchObject({
        lastSuccessfulRefreshAt: null,
        lastAttemptedRefreshAt: 3_000,
        lastError: expect.stringContaining("icon write failed"),
      });
    });
  });

  describe("catalog installs", () => {
    async function refreshedCatalog(entry: Record<string, unknown>) {
      const catalog = service({
        fetch: async (url) =>
          url === MANIFEST_URL
            ? Response.json(manifest([entry]))
            : new Response(VALID_SVG, { status: 200 }),
      });
      await refreshMarketplace(catalog, REMOTE, 1_000);
      return catalog;
    }

    it("offers a marketplace entry without judging compatibility", async () => {
      const catalog = await refreshedCatalog(remoteEntry({ icon: "Zap" }));
      const [entry] = await catalog.search("widgets");
      expect(entry).toMatchObject({
        compatible: true,
        incompatibleReason: null,
      });
      const plan = await catalog.installPlan({ entryId: "widgets" });
      expect(plan).toMatchObject({
        compatible: true,
        incompatibleReason: null,
      });
    });

    it("reads the installed flag from catalog provenance", async () => {
      const catalog = service({
        remoteManifest: manifest([HOVER_CARDS_ENTRY]),
      });
      upsertInstalledPlugin(db, {
        id: "hover-cards",
        source:
          "git:https://github.com/brsbl/bb-plugins.git@30f91fd977ba1ce60532af27a68534464fb62516",
        provenance: {
          kind: "catalog",
          marketplace: REMOTE,
          entryId: "thread-hover-cards",
        },
        sourceIntent: {
          kind: "git",
          url: "https://github.com/brsbl/bb-plugins.git",
          subdirectory: null,
          selector: {
            kind: "ref",
            ref: "30f91fd977ba1ce60532af27a68534464fb62516",
            refKind: "commit",
          },
        },
        exactResolution: {
          kind: "git",
          commit: "30f91fd977ba1ce60532af27a68534464fb62516",
        },
        updateState: {
          lastCheckAt: null,
          availableCompatibleVersion: null,
          newestIncompatibleVersion: null,
          statusDetail: null,
        },
        activeArtifactId: null,
        rootDir: "/managed/thread-hover-cards",
        version: "0.1.0",
        enabled: true,
        enabledFollowsDefault: false,
      });
      expect((await catalog.search("thread-hover-cards"))[0]?.installed).toBe(
        true,
      );
    });

    it.each([
      {
        name: "a local checkout",
        source: "path:/Users/me/git/thread-hover-cards",
        sourceIntent: {
          kind: "path",
          canonicalPath: "/Users/me/git/thread-hover-cards",
        },
        installed: false,
      },
      {
        name: "a different git repository",
        source: "git:https://github.com/someone-else/hover-cards.git@main",
        sourceIntent: {
          kind: "git",
          url: "https://github.com/someone-else/hover-cards.git",
          subdirectory: null,
          selector: { kind: "ref", ref: "main", refKind: "branch" },
        },
        installed: false,
      },
      {
        name: "the entry's git repository",
        source: "git:https://github.com/brsbl/bb-plugins@main",
        sourceIntent: {
          kind: "git",
          url: "https://github.com/brsbl/bb-plugins",
          subdirectory: null,
          selector: { kind: "ref", ref: "main", refKind: "branch" },
        },
        installed: true,
      },
    ] satisfies {
      name: string;
      source: string;
      sourceIntent: PluginSourceIntent;
      installed: boolean;
    }[])(
      "reports a direct install from $name with the same id as installed: $installed",
      async ({ source, sourceIntent, installed }) => {
        const catalog = service({
          remoteManifest: manifest([HOVER_CARDS_ENTRY]),
        });
        upsertInstalledPlugin(db, {
          id: "thread-hover-cards",
          source,
          provenance: { kind: "direct" },
          sourceIntent,
          exactResolution:
            sourceIntent.kind === "git"
              ? { kind: "git", commit: "0".repeat(40) }
              : { kind: "path" },
          updateState: {
            lastCheckAt: null,
            availableCompatibleVersion: null,
            newestIncompatibleVersion: null,
            statusDetail: null,
          },
          activeArtifactId: null,
          rootDir: "/Users/me/git/thread-hover-cards",
          version: "0.1.0",
          enabled: true,
          enabledFollowsDefault: false,
        });
        expect((await catalog.search("thread-hover-cards"))[0]).toMatchObject({
          installed,
          conflictingInstallSource: installed ? null : source,
        });
      },
    );
  });

  describe("catalog limits and trust", () => {
    it("refreshes and searches a catalog with more than 1024 entries", async () => {
      const largeManifest = manifest(
        Array.from({ length: 1025 }, (_unused, index) =>
          remoteEntry({ id: `widgets-${index}`, icon: "Zap" }),
        ),
      );
      const catalog = service({
        fetch: async () => Response.json(largeManifest),
      });

      await refreshMarketplace(catalog, REMOTE, 1_000);
      expect(getPluginMarketplace(db, REMOTE)?.lastError).toBeNull();
      expect(await catalog.search("widgets")).toHaveLength(1025);
      expect(await catalog.search("widgets-1024")).toEqual([
        expect.objectContaining({ entryId: "widgets-1024" }),
      ]);
    });

    it("refreshes a remote manifest larger than 1 MiB", async () => {
      const largeManifest = manifest(
        Array.from({ length: 600 }, (_unused, index) =>
          remoteEntry({
            id: `widgets-${index}`,
            icon: "Zap",
            description: "x".repeat(2_000),
          }),
        ),
      );
      expect(JSON.stringify(largeManifest).length).toBeGreaterThan(1_048_576);
      const catalog = service({
        fetch: async () => Response.json(largeManifest),
      });

      await refreshMarketplace(catalog, REMOTE, 1_000);
      expect(getPluginMarketplace(db, REMOTE)?.lastError).toBeNull();
      expect(await catalog.search("widgets")).toHaveLength(600);
    });

    it("stores catalog icons totaling more than 8 MiB", async () => {
      const bigSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><title>${"a".repeat(200 * 1024)}</title><path d="M0 0h16v16H0z"/></svg>`,
      );
      const entries = Array.from({ length: 64 }, (_unused, index) =>
        remoteEntry({
          id: `widgets-${index}`,
          icon: { url: `./icons/widgets-${index}.svg` },
        }),
      );
      const catalog = service({
        fetch: async (url) =>
          url === MANIFEST_URL
            ? Response.json(manifest(entries))
            : new Response(bigSvg, {
                status: 200,
                headers: { "content-type": "image/svg+xml" },
              }),
      });

      await refreshMarketplace(catalog, REMOTE, 1_000);
      const icons = listPluginMarketplaceIcons(db, REMOTE);
      expect(icons).toHaveLength(64);
      expect(
        icons.reduce((total, icon) => total + icon.bytes.byteLength, 0),
      ).toBeGreaterThan(8 * 1024 * 1024);
    });

    it("fetches entry icons concurrently", async () => {
      let inFlight = 0;
      let peak = 0;
      const entries = Array.from({ length: 12 }, (_unused, index) =>
        remoteEntry({
          id: `widgets-${index}`,
          icon: { url: `./icons/widgets-${index}.svg` },
        }),
      );
      const catalog = service({
        fetch: async (url) => {
          if (url === MANIFEST_URL) return Response.json(manifest(entries));
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight -= 1;
          return new Response(VALID_SVG, {
            status: 200,
            headers: { "content-type": "image/svg+xml" },
          });
        },
      });

      await refreshMarketplace(catalog, REMOTE, 1_000);
      expect(peak).toBeGreaterThan(1);
      expect(await catalog.search("widgets-11")).toHaveLength(1);
    });

    it("drops an icon aimed at a non-public address", async () => {
      const warnings: string[] = [];
      const iconRequests: string[] = [];
      const catalog = service({
        warn: (message) => warnings.push(message),
        fetch: async (url) => {
          if (url === MANIFEST_URL) {
            return Response.json(
              manifest([
                remoteEntry({ icon: { url: "https://127.0.0.1/widgets.svg" } }),
              ]),
            );
          }
          iconRequests.push(url);
          return new Response(VALID_SVG, {
            status: 200,
            headers: { "content-type": "image/svg+xml" },
          });
        },
      });

      await refreshMarketplace(catalog, REMOTE, 1_000);
      expect(iconRequests).toEqual([]);
      expect(await catalog.icon(REMOTE, "widgets")).toBeUndefined();
      expect(warnings.join("\n")).toMatch(/non-public address 127\.0\.0\.1/u);
    });

    it("drops a remote entry that claims a bundled plugin id", async () => {
      const bundled = listBundledPluginRegistrations();
      const occupied = bundled[0];
      if (occupied === undefined) throw new Error("no bundled plugin");
      const catalog = service({
        fetch: async (url) =>
          url === MANIFEST_URL
            ? Response.json(
                manifest([
                  remoteEntry({ id: occupied.pluginId }),
                  remoteEntry({ id: "widgets" }),
                ]),
              )
            : new Response(VALID_SVG, {
                status: 200,
                headers: { "content-type": "image/svg+xml" },
              }),
      });

      await refreshMarketplace(catalog, REMOTE, 1_000);
      const results = await catalog.search("");
      expect(
        results.filter((entry) => entry.pluginId === occupied.pluginId),
      ).toHaveLength(1);
      expect(
        results.find((entry) => entry.pluginId === occupied.pluginId)?.source,
      ).toBe(`builtin:${occupied.name}`);
      expect(results.some((entry) => entry.entryId === "widgets")).toBe(true);
      expect(getPluginMarketplace(db, REMOTE)?.lastError).toMatch(
        new RegExp(`matches a bundled plugin: ${occupied.pluginId}`, "u"),
      );
    });

    it("names the pinned npm registry in the entry source display", async () => {
      const catalog = service({
        fetch: async (url) =>
          url === MANIFEST_URL
            ? Response.json(
                manifest([
                  remoteEntry({
                    icon: "ZoomIn",
                    source: {
                      npm: {
                        package: "bb-plugin-widgets",
                        range: "^1.0.0",
                        registry: "https://npm.acme.test",
                      },
                    },
                  }),
                ]),
              )
            : new Response(null, { status: 404 }),
      });

      await refreshMarketplace(catalog, REMOTE, 1_000);
      expect((await catalog.search("widgets"))[0]?.source).toBe(
        "npm:bb-plugin-widgets@^1.0.0 (registry https://npm.acme.test)",
      );
    });
  });

  it("defers the periodic marketplace refresh while the server is moving", async () => {
    const fetched: string[] = [];
    const catalog = service({
      fetch: async (url) => {
        fetched.push(String(url));
        return new Response(null, { status: 503 });
      },
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    setServerMoveFrozen(db, true);
    try {
      catalog.startPeriodicRefresh();
      await vi.advanceTimersByTimeAsync(0);
      expect(fetched).toEqual([]);
      expect(
        getPluginMarketplace(db, REMOTE)
          ?.lastAttemptedRefreshAt,
      ).toBeNull();

      setServerMoveFrozen(db, false);
      await vi.advanceTimersByTimeAsync(SERVER_MOVE_FROZEN_RETRY_MS);
      await vi.waitFor(() => {
        expect(fetched).not.toEqual([]);
      });
    } finally {
      catalog.stopPeriodicRefresh();
      setServerMoveFrozen(db, false);
      vi.useRealTimers();
    }
  });
});

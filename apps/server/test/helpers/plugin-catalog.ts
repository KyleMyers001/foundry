import type { PluginCatalogService } from "../../src/services/plugin-catalog/plugin-catalog-service.js";

export async function refreshMarketplace(
  catalog: Pick<PluginCatalogService, "refreshMarketplaces">,
  name: string,
  attemptedAt: number,
): Promise<void> {
  const [result] = await catalog.refreshMarketplaces({ name, attemptedAt });
  if (result !== undefined && !result.ok) {
    throw new Error(result.error ?? "marketplace refresh failed");
  }
}

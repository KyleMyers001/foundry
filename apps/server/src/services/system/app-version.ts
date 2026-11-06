import type { AppInstallKind } from "@bb/config/app-install";
import type { SystemVersionResponse } from "@bb/server-contract";
import type { ServerRuntimeConfig } from "../../types.js";

export const FOUNDRY_RELEASES_URL =
  "https://github.com/KyleMyers001/foundry/releases/latest";

export interface AppVersionService {
  getSystemVersion(
    args?: AppVersionGetSystemVersionArgs,
  ): Promise<SystemVersionResponse>;
}

interface AppVersionGetSystemVersionArgs {
  forceRefresh?: boolean;
}

interface CreateAppVersionServiceArgs {
  installKind: AppInstallKind | null;
  sourceCommit: string | null;
  config: Pick<ServerRuntimeConfig, "appVersion" | "isDevelopment">;
}

export function createAppVersionService(
  args: CreateAppVersionServiceArgs,
): AppVersionService {
  return {
    async getSystemVersion(): Promise<SystemVersionResponse> {
      return {
        currentCommit: args.installKind === "source" ? args.sourceCommit : null,
        installKind: args.installKind,
        currentVersion: args.config.appVersion,
        latestVersion: null,
        source: "foundry-releases",
        updateAvailable: false,
        isDevelopment: args.config.isDevelopment,
        releasesUrl: FOUNDRY_RELEASES_URL,
      };
    },
  };
}

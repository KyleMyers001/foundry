import type {
  ServerAccessStatus,
  SystemMachineProvider,
} from "@bb/server-contract";
import { machineServerAccessBlockedReason } from "../src/components/machines/machine-server-access";
import type { MachineAccessState } from "../src/components/settings/MachineAccessSettings";

const noop = () => {};
const noopAsync = async () => {};

export const PLUGIN_ACCESS_SETUP_REQUIRED: ServerAccessStatus = {
  providers: [
    {
      id: "example-tunnel",
      displayName: "Example tunnel",
      description: "Use the address an example tunnel plugin provides.",
      pluginId: "example-tunnel",
      availability: {
        status: "setup-required",
        message: "Sign in to the example tunnel",
      },
    },
    {
      id: "direct",
      displayName: "Manual",
      description: "Use your own domain or network address.",
      pluginId: null,
      availability: null,
    },
  ],
  defaultProviderId: "example-tunnel",
  effectiveUrl: null,
  urlSource: null,
  notice: null,
};

export const PLUGIN_ACCESS_AVAILABLE: ServerAccessStatus = {
  ...PLUGIN_ACCESS_SETUP_REQUIRED,
  providers: PLUGIN_ACCESS_SETUP_REQUIRED.providers.map((provider) =>
    provider.id === "example-tunnel"
      ? {
          ...provider,
          availability: {
            status: "available",
            serverUrl: "https://bb.example.com",
          },
        }
      : provider,
  ),
};

export const PLUGIN_ACCESS_UNAVAILABLE: ServerAccessStatus = {
  ...PLUGIN_ACCESS_SETUP_REQUIRED,
  providers: PLUGIN_ACCESS_SETUP_REQUIRED.providers.map((provider) =>
    provider.id === "example-tunnel"
      ? {
          ...provider,
          availability: {
            status: "unavailable",
            message: "Credential revoked",
          },
        }
      : provider,
  ),
};

export const MANUAL_WITHOUT_URL: ServerAccessStatus = {
  ...PLUGIN_ACCESS_SETUP_REQUIRED,
  defaultProviderId: "direct",
};

export function machineAccessState(
  access: ServerAccessStatus,
  overrides: Partial<MachineAccessState> = {},
): MachineAccessState {
  const selected =
    overrides.selected ?? access.defaultProviderId ?? "example-tunnel";
  return {
    access,
    disabled: false,
    draft: null,
    error: null,
    effective: access.providers.find((provider) => provider.id === selected),
    configurationMessage: machineServerAccessBlockedReason(access, selected),
    saving: false,
    selected,
    value: access.urlSource === "setting" ? (access.effectiveUrl ?? "") : "",
    editDraft: noop,
    selectProvider: noop,
    commitUrl: noopAsync,
    ...overrides,
  };
}

export function machineProvider(
  overrides: Partial<SystemMachineProvider> &
    Pick<SystemMachineProvider, "id" | "displayName">,
): SystemMachineProvider {
  return {
    description: "Run a machine for development.",
    icon: "Terminal",
    logoUrl: null,
    pluginId: `plugin-${overrides.id}`,
    inputs: null,
    acceptsEmptyInputs: true,
    supportsSuspend: false,
    ...overrides,
  };
}

export const SANDBOX_MACHINE_PROVIDER = machineProvider({
  id: "example-sandbox",
  displayName: "Example Sandbox",
  description: "Create a sandbox from an example machine provider plugin.",
  pluginId: "example-sandbox",
  icon: "Server",
  supportsSuspend: true,
});

export const MANUAL_MACHINE_PROVIDER = machineProvider({
  id: "manual",
  displayName: "Manual machine setup",
  description:
    "Run one command on a machine you already have to connect it to this server.",
  pluginId: "core",
  icon: "Terminal",
});

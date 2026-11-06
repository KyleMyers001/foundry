import { PluginMobileSettingsSections } from "@/components/plugin/PluginSettingsSections";
import { MachineAccessSettings } from "./MachineAccessSettings";

export function MobileAppSection() {
  return (
    <section aria-label="Mobile access" className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Mobile</h2>
        <p className="mt-1 text-sm text-subtle-foreground">
          Open this server's URL in a phone browser or in a mobile build you
          install yourself. Foundry does not publish mobile app builds.
        </p>
      </div>
      <MachineAccessSettings title="Accessing bb from your phone">
        {(pluginId) => <PluginMobileSettingsSections pluginId={pluginId} />}
      </MachineAccessSettings>
    </section>
  );
}

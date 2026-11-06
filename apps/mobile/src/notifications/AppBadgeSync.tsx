import { useEffect } from "react";
import { AppState } from "react-native";
import { useProfiles } from "@/app-shell";
import { getAppBadgeModule } from "./expo-push-module";

let desiredBadgeCount = 0;
const listeners = new Set<() => void>();

export function updateAppBadgeCount(count: number): void {
  desiredBadgeCount = count;
  for (const listener of listeners) listener();
}

export function AppBadgeSync() {
  const { connection } = useProfiles();
  const connected = connection !== null;

  useEffect(() => {
    if (!connected) return;
    const badge = getAppBadgeModule();
    const write = () => {
      void badge.setBadgeCount(desiredBadgeCount).catch(() => undefined);
    };
    listeners.add(write);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") write();
    });
    return () => {
      listeners.delete(write);
      subscription.remove();
    };
  }, [connected]);

  return null;
}

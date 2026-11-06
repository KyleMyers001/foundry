import * as Notifications from "expo-notifications";

export interface AppBadgeModule {
  setBadgeCount(count: number): Promise<void>;
}

export function createAppBadgeModule(): AppBadgeModule {
  return {
    setBadgeCount(count) {
      return Notifications.setBadgeCountAsync(count).then(() => undefined);
    },
  };
}

let instance: AppBadgeModule | null = null;

export function getAppBadgeModule(): AppBadgeModule {
  instance ??= createAppBadgeModule();
  return instance;
}

import { openUrlInExternalBrowser } from "@/lib/url-open-routing";

export const FOUNDRY_RELEASES_INDEX_URL =
  "https://github.com/KyleMyers001/foundry/releases";

export function openReleaseNotesOnWeb(): void {
  openUrlInExternalBrowser(FOUNDRY_RELEASES_INDEX_URL);
}

import { openUrlInExternalBrowser } from "@/lib/url-open-routing";

const RELEASE_NOTES_BASE_URL = "https://getbb.app/changelog";

export function getReleaseNotesUrl(version: string): string {
  return `${RELEASE_NOTES_BASE_URL}#${version.replaceAll(".", "-")}`;
}

export function openReleaseNotesOnWeb(notesVersion: string): void {
  openUrlInExternalBrowser(getReleaseNotesUrl(notesVersion));
}

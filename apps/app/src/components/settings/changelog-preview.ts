import changelogSource from "../../../../../CHANGELOG.md?raw";
import { parseChangelog } from "../../../../../changelog-parser";
import { RELEASE_META } from "../../../../../changelog-metadata";

export { RELEASE_META };
export type {
  ChangelogBlock,
  ChangelogEntry,
} from "../../../../../changelog-parser";

export const CHANGELOG_ENTRIES = parseChangelog(changelogSource);

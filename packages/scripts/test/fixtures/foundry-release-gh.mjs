import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const [command, action, tag, ...args] = process.argv.slice(2);
const statePath = process.env.RELEASE_TEST_STATE;
const state = JSON.parse(readFileSync(statePath, "utf8"));
const save = () => writeFileSync(statePath, JSON.stringify(state));
const option = (name) => args[args.indexOf(name) + 1];
const upload = (release, files) => {
  for (const file of files) {
    release.assets[basename(file)] = readFileSync(file, "utf8");
  }
};

if (command === "api" && action.includes("/commits/")) {
  const sha = state.tags[action.split("/").at(-1)];
  if (!sha) process.exit(1);
  console.log(sha);
} else if (command === "release") {
  const release = state.releases[tag];
  const files = args.filter((arg) => existsSync(arg) && statSync(arg).isFile());
  if (action === "view") {
    if (!release) process.exit(1);
    const query = option("--jq");
    if (query?.includes("@tsv")) {
      console.log(`${release.isDraft}\t${release.targetCommitish}`);
    } else if (query === ".targetCommitish") {
      console.log(release.targetCommitish);
    } else if (query === ".isDraft") {
      console.log(release.isDraft);
    } else if (query === ".assets[].name") {
      console.log(Object.keys(release.assets).join("\n"));
    } else {
      console.log(JSON.stringify(release));
    }
  } else if (action === "create") {
    if (release) process.exit(1);
    const created = {
      isDraft: args.includes("--draft"),
      targetCommitish: option("--target"),
      assets: {},
    };
    upload(created, files);
    state.releases[tag] = created;
    if (!created.isDraft) state.tags[tag] = created.targetCommitish;
    if (args.includes("--latest")) state.latest = tag;
    save();
  } else if (action === "upload") {
    if (!release) process.exit(1);
    upload(
      release,
      process.env.RELEASE_TEST_FAILURE === "upload" ? files.slice(0, 1) : files,
    );
    save();
    if (process.env.RELEASE_TEST_FAILURE === "upload") process.exit(23);
  } else if (action === "delete-asset") {
    delete release.assets[args[0]];
    save();
  } else {
    throw new Error(`Unexpected gh release command: ${action}`);
  }
} else {
  throw new Error(`Unexpected gh command: ${command}`);
}

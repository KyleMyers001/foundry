import { join } from "node:path";

const FOUNDRY_DATA_DIR_NAME = ".foundry";
const FOUNDRY_SERVER_PORT = "38986";
const FOUNDRY_HOST_DAEMON_PORT = "38987";

function setWhenUnset(
  env: NodeJS.ProcessEnv,
  name: string,
  value: string,
): void {
  if ((env[name]?.trim() ?? "").length === 0) {
    env[name] = value;
  }
}

export function applyFoundryRuntimeDefaults(args: {
  env: NodeJS.ProcessEnv;
  homeDir: string;
}): void {
  setWhenUnset(
    args.env,
    "BB_DATA_DIR",
    join(args.homeDir, FOUNDRY_DATA_DIR_NAME),
  );
  setWhenUnset(args.env, "BB_SERVER_PORT", FOUNDRY_SERVER_PORT);
  setWhenUnset(args.env, "BB_HOST_DAEMON_PORT", FOUNDRY_HOST_DAEMON_PORT);
}

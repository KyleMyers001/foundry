import { homedir } from "node:os";
import { app } from "electron";
import { applyFoundryRuntimeDefaults } from "./foundry-runtime-defaults.js";

if (app.isPackaged) {
  applyFoundryRuntimeDefaults({ env: process.env, homeDir: homedir() });
}

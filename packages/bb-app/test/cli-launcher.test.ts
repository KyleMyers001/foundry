import { execFile } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { CLI_LAUNCHER_MARKER } from "@bb/config/cli-command";
import {
  formatCliLauncherPath,
  renderCliLauncher,
  resolveCliLauncherTarget,
  writeCliLauncher,
} from "../src/cli-launcher.js";

const execFileAsync = promisify(execFile);
const posixIt = process.platform === "win32" ? it.skip : it;
const scratchDirs: string[] = [];

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

function scratchDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "bb-cli-launcher-")));
  scratchDirs.push(dir);
  return dir;
}

const ARGUMENT_ECHO_SCRIPT =
  "process.stdout.write(JSON.stringify({ args: process.argv.slice(2), dataDir: process.env.BB_DATA_DIR }));\n";

function writeExecutable(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

describe("bb command launcher", () => {
  posixIt.each([
    {
      name: "fresh shell",
      env: {},
      config: {},
      serverUrl: "http://127.0.0.1:38986",
      daemonPort: 38987,
    },
    {
      name: "caller ports",
      env: { BB_SERVER_PORT: "41001", BB_HOST_DAEMON_PORT: "41002" },
      config: {},
      serverUrl: "http://127.0.0.1:41001",
      daemonPort: 41002,
    },
    {
      name: "caller URL",
      env: { BB_SERVER_URL: "https://caller.example.com" },
      config: {},
      serverUrl: "https://caller.example.com",
      daemonPort: 38987,
    },
    {
      name: "managed remote",
      env: {},
      config: { serverUrl: "https://remote.example.com" },
      serverUrl: "https://remote.example.com",
      daemonPort: 38987,
    },
  ])(
    "resolves Foundry's generated command endpoints for $name",
    async (scenario) => {
      const root = scratchDir();
      const dataDir = join(root, "data");
      mkdirSync(dataDir);
      writeFileSync(
        join(dataDir, "config.json"),
        JSON.stringify(scenario.config),
      );
      const entryPath = join(root, "bb.mjs");
      writeFileSync(
        entryPath,
        `
      import { resolveBbAppRuntimeState } from ${JSON.stringify(new URL("../src/launcher.ts", import.meta.url).href)};
      const { context } = await resolveBbAppRuntimeState({
        entrypointUrl: import.meta.url,
        env: process.env,
        homeDir: process.env.HOME,
        options: { help: false, json: false },
        serverUrlMode: "managed",
      });
      process.stdout.write(JSON.stringify({ serverUrl: context.serverUrl, daemonPort: context.daemonPort }));
    `,
      );
      const runtimePath = join(root, "node-with-source");
      const tsx = createRequire(import.meta.url).resolve("tsx");
      writeExecutable(
        runtimePath,
        `#!/bin/sh\nexec '${process.execPath}' --conditions=source --import '${tsx}' "$@"\n`,
      );
      const launcherPath = join(root, "bin", "bb");
      await writeCliLauncher({
        content: renderCliLauncher({
          dataDir,
          serverPort: 38986,
          daemonPort: 38987,
          platform: process.platform,
          target: { electron: false, entryPath, kind: "direct", runtimePath },
        }),
        launcherPath,
      });
      const result = await execFileAsync(launcherPath, [], {
        env: { HOME: root, PATH: "/nonexistent", ...scenario.env },
      });
      expect(JSON.parse(result.stdout)).toEqual({
        serverUrl: scenario.serverUrl,
        daemonPort: scenario.daemonPort,
      });
    },
  );

  posixIt(
    "runs the bb entry with the install's runtime and passes arguments through unchanged",
    async () => {
      const root = scratchDir();
      const entryPath = join(root, "it's here", "bb.js");
      mkdirSync(dirname(entryPath));
      writeFileSync(entryPath, ARGUMENT_ECHO_SCRIPT);
      const dataDir = join(root, "data dir");
      const launcherPath = formatCliLauncherPath({
        dataDir,
        platform: process.platform,
      });
      await writeCliLauncher({
        content: renderCliLauncher({
          dataDir,
          serverPort: 38886,
          daemonPort: 38887,
          platform: process.platform,
          target: {
            electron: false,
            entryPath,
            kind: "direct",
            runtimePath: process.execPath,
          },
        }),
        launcherPath,
      });

      const result = await execFileAsync(
        launcherPath,
        ["thread", "a b", "it's", "$HOME", ""],
        { env: { PATH: "/nonexistent" } },
      );
      expect(JSON.parse(result.stdout)).toEqual({
        args: ["thread", "a b", "it's", "$HOME", ""],
        dataDir,
      });

      const overridden = await execFileAsync(launcherPath, [], {
        env: { BB_DATA_DIR: "/elsewhere", PATH: "/nonexistent" },
      });
      expect(JSON.parse(overridden.stdout)).toEqual({
        args: [],
        dataDir: "/elsewhere",
      });
    },
  );

  posixIt(
    "says how to repair the command when the install it points at is gone",
    async () => {
      const root = scratchDir();
      const launcherPath = join(root, "bin", "bb");
      await writeCliLauncher({
        content: renderCliLauncher({
          dataDir: root,
          serverPort: 38886,
          daemonPort: 38887,
          platform: process.platform,
          target: {
            electron: false,
            entryPath: join(root, "removed", "bb.js"),
            kind: "direct",
            runtimePath: process.execPath,
          },
        }),
        launcherPath,
      });

      await expect(
        execFileAsync(launcherPath, ["status"]),
      ).rejects.toMatchObject({
        code: 127,
        stderr:
          "bb has moved or been removed. Start bb once to update this command.\n",
      });
    },
  );

  posixIt(
    "runs the entry from the AppImage's own mount without letting AppRun put a sandbox flag before Node's options",
    async () => {
      const root = scratchDir();
      const mountDir = join(root, "mount");
      const entryPath = join(mountDir, "resources", "bb-app", "dist", "bb.js");
      writeExecutable(entryPath, ARGUMENT_ECHO_SCRIPT);
      const appImagePath = join(root, "bb.AppImage");
      writeExecutable(
        appImagePath,
        [
          "#!/bin/sh",
          `export APPDIR='${mountDir}'`,
          'for arg in "$@"; do',
          '  if [ "$arg" = --no-sandbox ]; then',
          `    exec '${process.execPath}' "$@"`,
          "  fi",
          "done",
          `exec '${process.execPath}' --no-sandbox "$@"`,
          "",
        ].join("\n"),
      );
      const target = resolveCliLauncherTarget({
        electron: true,
        env: { APPDIR: join(root, "stale-mount"), APPIMAGE: appImagePath },
        execPath: join(root, "stale-mount", "bb"),
        packageRoot: join(root, "stale-mount", "resources", "bb-app"),
        platform: "linux",
      });
      expect(target).toEqual({
        appImagePath,
        entryRelativePath: join("resources", "bb-app", "dist", "bb.js"),
        kind: "appimage",
      });
      const launcherPath = join(root, "bin", "bb");
      await writeCliLauncher({
        content: renderCliLauncher({
          dataDir: join(root, "data"),
          serverPort: 38886,
          daemonPort: 38887,
          platform: "linux",
          target,
        }),
        launcherPath,
      });

      const result = await execFileAsync(launcherPath, ["thread", "a b"], {
        env: { PATH: "/usr/bin:/bin" },
      });
      expect(JSON.parse(result.stdout)).toEqual({
        args: ["thread", "a b"],
        dataDir: join(root, "data"),
      });
      const noArguments = await execFileAsync(launcherPath, [], {
        env: { PATH: "/usr/bin:/bin" },
      });
      expect(JSON.parse(noArguments.stdout).args).toEqual([]);
    },
  );

  it("runs Electron as Node only for an install that runs inside Electron", () => {
    const base = {
      env: {},
      execPath: "/Applications/bb.app/Contents/MacOS/bb",
      packageRoot: "/Applications/bb.app/Contents/Resources/bb-app",
      platform: "darwin" as const,
    };
    const electron = renderCliLauncher({
      dataDir: "/Users/me/.bb",
      serverPort: 38886,
      daemonPort: 38887,
      platform: "darwin",
      target: resolveCliLauncherTarget({ ...base, electron: true }),
    });
    const node = renderCliLauncher({
      dataDir: "/Users/me/.bb",
      serverPort: 38886,
      daemonPort: 38887,
      platform: "darwin",
      target: resolveCliLauncherTarget({ ...base, electron: false }),
    });

    expect(electron).toContain("export ELECTRON_RUN_AS_NODE=1\n");
    expect(node).not.toContain("ELECTRON_RUN_AS_NODE");
  });

  it("writes a Windows batch launcher that survives percent signs and spaces", () => {
    const launcher = renderCliLauncher({
      dataDir: "C:\\Users\\me\\.bb",
      serverPort: 38886,
      daemonPort: 38887,
      platform: "win32",
      target: {
        electron: true,
        entryPath: "C:\\Program Files (x86)\\bb\\100%\\dist\\bb.js",
        kind: "direct",
        runtimePath: "C:\\Program Files (x86)\\bb\\bb.exe",
      },
    });

    expect(launcher.split("\r\n")).toEqual([
      "@echo off",
      `rem ${CLI_LAUNCHER_MARKER}`,
      "setlocal EnableExtensions DisableDelayedExpansion",
      'if not defined BB_DATA_DIR set "BB_DATA_DIR=C:\\Users\\me\\.bb"',
      'if not defined BB_SERVER_PORT set "BB_SERVER_PORT=38886"',
      'if not defined BB_HOST_DAEMON_PORT set "BB_HOST_DAEMON_PORT=38887"',
      'set "ELECTRON_RUN_AS_NODE=1"',
      'if not exist "C:\\Program Files (x86)\\bb\\bb.exe" goto moved',
      'if exist "C:\\Program Files (x86)\\bb\\100%%\\dist\\bb.js" goto run',
      ":moved",
      "echo bb has moved or been removed. Start bb once to update this command. 1>&2",
      "exit /b 127",
      ":run",
      '"C:\\Program Files (x86)\\bb\\bb.exe" "C:\\Program Files (x86)\\bb\\100%%\\dist\\bb.js" %*',
      'set "bb_exit=%ERRORLEVEL%"',
      "exit /b %bb_exit%",
      "",
    ]);
  });

  it("leaves a launcher file that bb did not write", async () => {
    const root = scratchDir();
    const launcherPath = join(root, "bin", "bb");
    mkdirSync(dirname(launcherPath));
    writeFileSync(launcherPath, "#!/bin/sh\necho mine\n");

    await expect(
      writeCliLauncher({ content: "replacement", launcherPath }),
    ).resolves.toBe("foreign");
    expect(readFileSync(launcherPath, "utf8")).toBe("#!/bin/sh\necho mine\n");
  });

  it("rewrites its own launcher when the install moves", async () => {
    const root = scratchDir();
    const launcherPath = join(root, "bin", "bb");
    const first = `# ${CLI_LAUNCHER_MARKER}\nfirst\n`;
    const second = `# ${CLI_LAUNCHER_MARKER}\nsecond\n`;

    await expect(
      writeCliLauncher({ content: first, launcherPath }),
    ).resolves.toBe("written");
    await expect(
      writeCliLauncher({ content: first, launcherPath }),
    ).resolves.toBe("unchanged");
    await expect(
      writeCliLauncher({ content: second, launcherPath }),
    ).resolves.toBe("written");
    expect(readFileSync(launcherPath, "utf8")).toBe(second);
  });
});

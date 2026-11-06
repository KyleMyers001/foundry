export const RETIRED_CONNECT_PROFILE_DETAIL =
  "This server used bb connect, which Foundry no longer supports, so the app won't open it. Its saved details are kept. Add the server's direct or Tailscale address in Servers.";

export type ShellLoadPhase =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "failed"; detail: string }
  | { kind: "http-error"; status: number };

export type ShellScreenState =
  | { kind: "loading"; message: string }
  | { kind: "no-profile" }
  | { kind: "webview"; serverErrorStatus: number | null }
  | {
      kind: "error";
      title: string;
      detail: string;
      action: "retry" | "servers";
    };

interface ShellScreenInput {
  storeReady: boolean;
  hasAnyProfile: boolean;
  hasProfile: boolean;
  retiredConnectProfile: boolean;
  load: ShellLoadPhase;
}

export function resolveShellScreenState(
  input: ShellScreenInput,
): ShellScreenState {
  if (!input.storeReady) {
    return { kind: "loading", message: "Opening server" };
  }
  if (!input.hasAnyProfile) {
    return { kind: "no-profile" };
  }
  if (!input.hasProfile) {
    return { kind: "loading", message: "Opening server" };
  }
  if (input.retiredConnectProfile) {
    return {
      kind: "error",
      title: "bb connect is no longer supported",
      detail: RETIRED_CONNECT_PROFILE_DETAIL,
      action: "servers",
    };
  }
  switch (input.load.kind) {
    case "failed":
      return {
        kind: "error",
        title: "The page did not load",
        detail: input.load.detail,
        action: "retry",
      };
    case "http-error":
      return { kind: "webview", serverErrorStatus: input.load.status };
    case "loading":
    case "ready":
      return { kind: "webview", serverErrorStatus: null };
  }
}

export function revealsShellFailure(screen: ShellScreenState): boolean {
  return (
    screen.kind === "error" ||
    (screen.kind === "webview" && screen.serverErrorStatus !== null)
  );
}

export function resolveShellLoadPath(input: {
  visitedPath: string | null;
  requestedPath: string | undefined;
}): string {
  if (input.visitedPath !== null) return input.visitedPath;
  if (input.requestedPath !== undefined && input.requestedPath.length > 0) {
    return input.requestedPath;
  }
  return "/";
}

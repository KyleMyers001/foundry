import { createHash } from "node:crypto";
import type { BbDesktopServerChoice } from "@bb/desktop-contract";
import { BUILTIN_SERVER_NAME, type ServerTargetStore } from "./server-target.js";

export function customServerId(url: string): string {
  return `custom:${createHash("sha256").update(url).digest("hex")}`;
}

export function buildDesktopServerChoices(
  store: ServerTargetStore | null,
  builtinServerUrl: string,
): BbDesktopServerChoice[] {
  const target = store?.getTarget() ?? { kind: "builtin" };
  const customServers = store?.getCustomServers() ?? [];
  const showBuiltin =
    (store?.getShowBuiltinServer() ?? true) ||
    target.kind !== "custom" ||
    customServers.length === 0;
  return [
    ...(showBuiltin
      ? [
          {
            id: "builtin",
            name: BUILTIN_SERVER_NAME,
            origin: new URL(builtinServerUrl).origin,
            kind: "local" as const,
            active: target.kind === "builtin",
          },
        ]
      : []),
    ...customServers.map(({ url, name }) => ({
      id: customServerId(url),
      name: name ?? new URL(url).host,
      origin: new URL(url).origin,
      kind: "custom" as const,
      active: target.kind === "custom" && target.url === url,
    })),
  ];
}

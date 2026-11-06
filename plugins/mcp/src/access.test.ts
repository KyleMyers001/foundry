import { describe, expect, it } from "vitest";
import { mcpAccessProblem } from "./access.js";

function problem(headers: Record<string, string>) {
  return mcpAccessProblem(new Headers(headers));
}

describe("mcpAccessProblem", () => {
  it("lets a local caller with no gate headers through", () => {
    expect(problem({})).toBeNull();
  });

  it("refuses a local request that comes from a web page", () => {
    expect(problem({ origin: "https://evil.example" })).toMatchObject({
      status: 403,
    });
    expect(problem({ origin: "http://127.0.0.1:38886" })).toMatchObject({
      status: 403,
    });
  });

  it.each<Record<string, string>>([
    { "x-bb-gate-auth": "oauth", "x-bb-gate-oauth-scope": "bb" },
    {
      "x-bb-gate-auth": "oauth",
      "x-bb-gate-oauth-scope": "openid bb",
      origin: "https://evil.example",
    },
    { "x-bb-gate-auth": "session" },
    { "x-bb-gate-assertion": "anything" },
  ])("refuses bb connect gate headers no gate can send: %j", (headers) => {
    expect(problem(headers)).toMatchObject({ status: 403 });
  });
});

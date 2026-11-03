import { afterEach, describe, expect, it } from "vitest";
import { afterCommit } from "../src/index.js";
import { createMigratedConnection } from "../src/testing.js";

const connections: ReturnType<typeof createMigratedConnection>[] = [];
afterEach(() => {
  for (const db of connections.splice(0)) db.$client.close();
});

describe("after-commit callbacks", () => {
  it("discards rolled-back savepoints and keeps committed callbacks in order", () => {
    const db = createMigratedConnection();
    connections.push(db);
    const calls: string[] = [];
    db.transaction((tx) => {
      afterCommit(tx, () => calls.push("outer"));
      expect(() =>
        tx.transaction((nested) => {
          afterCommit(nested, () => calls.push("rolled back"));
          throw new Error("rollback");
        }),
      ).toThrow("rollback");
      tx.transaction((nested) => {
        afterCommit(nested, () => calls.push("nested"));
      });
      expect(calls).toEqual([]);
    });
    expect(calls).toEqual(["outer", "nested"]);
  });
});

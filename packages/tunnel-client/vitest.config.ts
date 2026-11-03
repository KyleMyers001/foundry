import {
  defineWorkspaceTestConfig,
  sharedWorkerProjects,
} from "../../vitest.shared.js";

export default defineWorkspaceTestConfig({
  test: {
    ...(process.env.VITEST_MAX_WORKERS
      ? { maxWorkers: Number(process.env.VITEST_MAX_WORKERS) }
      : {}),
    projects: sharedWorkerProjects({
      pkgDir: import.meta.dirname,
      name: "@bb/tunnel-client",
      include: ["test/**/*.test.ts"],
    }),
  },
});

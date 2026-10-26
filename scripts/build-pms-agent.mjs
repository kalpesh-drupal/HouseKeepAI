/**
 * Bundle the PMS agent into plain Node (no tsx at runtime) for Docker/Railway.
 */
import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  entryPoints: [path.join(projectRoot, "scripts/pms-agent-worker.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: path.join(projectRoot, "dist/pms-agent.cjs"),
  alias: {
    "@": path.join(projectRoot, "src"),
  },
  // Native / heavy packages stay external and load from node_modules at runtime.
  external: [
    "@prisma/client",
    ".prisma/client",
    "playwright",
    "playwright-core",
    "unpdf",
  ],
  logLevel: "info",
});

console.log("Built dist/pms-agent.cjs");

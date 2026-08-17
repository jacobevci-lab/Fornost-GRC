import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "";
const normalizedBasePath = configuredBasePath.replace(/^\/+|\/+$/g, "");

if (!normalizedBasePath) {
  process.exit(0);
}

const segments = normalizedBasePath.split("/");
if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
  throw new Error(`Unsafe NEXT_PUBLIC_BASE_PATH: ${configuredBasePath}`);
}

const projectRoot = process.env.SITES_PROJECT_ROOT || process.cwd();
const clientRoot = path.join(projectRoot, "dist", "client");
const targetRoot = path.join(clientRoot, ...segments);
const ignoredEntries = new Set([
  ".assetsignore",
  ".vite",
  "_headers",
  "assets",
  segments[0],
]);
const entries = await readdir(clientRoot, { withFileTypes: true });

await rm(targetRoot, { recursive: true, force: true });
await mkdir(targetRoot, { recursive: true });

for (const entry of entries) {
  if (ignoredEntries.has(entry.name)) continue;
  await cp(path.join(clientRoot, entry.name), path.join(targetRoot, entry.name), {
    recursive: true,
  });
}

console.log(`Staged browser assets under /${normalizedBasePath}/.`);

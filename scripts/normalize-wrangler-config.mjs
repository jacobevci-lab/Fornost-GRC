import { readFile, writeFile } from "node:fs/promises";

const configPath = new URL("../dist/server/wrangler.json", import.meta.url);
const config = JSON.parse(await readFile(configPath, "utf8"));

// Wrangler 4.120+ removed service environments and rejects this legacy Vinext
// output field. Removing it keeps the same default environment behavior.
delete config.legacy_env;

await writeFile(configPath, `${JSON.stringify(config)}\n`, "utf8");

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const migrationsDir = path.join(root, "drizzle");
const schemaPaths = [
  path.join(root, "db", "schema.ts"),
  path.join(root, "db", "identity-schema.ts"),
];

const migrationFiles = (await readdir(migrationsDir))
  .filter((name) => name.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b, "en"));

if (migrationFiles.length === 0) {
  throw new Error("No D1 migration SQL files found in drizzle/.");
}

const createdTables = new Map();
const createdIndexes = new Map();

const addUnique = (map, name, file, kind) => {
  const normalized = name.toLowerCase();
  const previous = map.get(normalized);
  if (previous) {
    throw new Error(
      `Duplicate ${kind} creation detected for ${name}: ${previous} and ${file}. ` +
        "Production D1 migration is blocked until the conflict is resolved."
    );
  }
  map.set(normalized, file);
};

for (const file of migrationFiles) {
  const sql = await readFile(path.join(migrationsDir, file), "utf8");

  for (const match of sql.matchAll(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"\[]?([A-Za-z0-9_]+)[`"\]]?/gi
  )) {
    addUnique(createdTables, match[1], file, "table");
  }

  for (const match of sql.matchAll(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"\[]?([A-Za-z0-9_]+)[`"\]]?/gi
  )) {
    addUnique(createdIndexes, match[1], file, "index");
  }
}

const schemaTables = new Set();
for (const schemaPath of schemaPaths) {
  const schemaSource = await readFile(schemaPath, "utf8");
  for (const match of schemaSource.matchAll(/sqliteTable\(\s*["'`]([^"'`]+)["'`]/g)) {
    schemaTables.add(match[1].toLowerCase());
  }
}

if (schemaTables.size === 0) {
  throw new Error("No sqliteTable declarations found in canonical schema modules.");
}

const missingTables = [...schemaTables]
  .filter((table) => !createdTables.has(table))
  .sort();

if (missingTables.length > 0) {
  throw new Error(
    `Current schema contains ${missingTables.length} table(s) with no CREATE TABLE migration:\n` +
      missingTables.map((table) => `  - ${table}`).join("\n") +
      "\nProduction D1 migration is blocked until schema and migrations are aligned."
  );
}

const historicalOnlyTables = [...createdTables.keys()]
  .filter((table) => !schemaTables.has(table))
  .sort();

console.log(`Validated ${migrationFiles.length} SQL migration file(s).`);
console.log(`Migration CREATE TABLE coverage: ${createdTables.size} table(s).`);
console.log(`Current Drizzle schema: ${schemaTables.size} table(s) across ${schemaPaths.length} module(s).`);
console.log("Migration order:");
for (const file of migrationFiles) console.log(`  - ${file}`);

if (historicalOnlyTables.length > 0) {
  console.warn(
    `Warning: ${historicalOnlyTables.length} historical migration table(s) are not present in the current schema: ` +
      historicalOnlyTables.join(", ")
  );
}

console.log("D1 migration preflight passed.");

import { readFileSync } from "node:fs";

const server = readFileSync("server.js", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

const requiredServerSnippets = [
  "process.env.DATABASE_URL",
  "await import(\"pg\")",
  "CREATE TABLE IF NOT EXISTS task_templates",
  "CREATE TABLE IF NOT EXISTS records",
  "CREATE TABLE IF NOT EXISTS custom_tasks",
  "jsonb",
  "async function readRecords",
  "async function readTaskTemplates",
  "async function readCustomTasks",
  "async function saveRecord",
  "async function saveCustomTask",
  "async function writeTaskTemplates",
  "async function importJsonData",
  "\"/api/admin/import-json\"",
  "process.env.IMPORT_TOKEN",
  "await recordsForPhone",
  "await customTasksForPhone",
  "await readTaskTemplates"
];

const missing = requiredServerSnippets.filter((snippet) => !server.includes(snippet));
if (missing.length) {
  throw new Error(`missing database storage snippets:\n${missing.join("\n")}`);
}

if (!pkg.dependencies?.pg) {
  throw new Error("package.json should include pg dependency for Render PostgreSQL");
}

if (pkg.scripts?.["import:render"] !== "node scripts/import-render-data.js") {
  throw new Error("package.json should include import:render script");
}

readFileSync("scripts/import-render-data.js", "utf8");

const storageReadyIndex = server.indexOf("const storageReady = initializeStorage();");
const dbPoolIndex = server.indexOf("let dbPoolPromise = null;");
if (dbPoolIndex === -1 || storageReadyIndex === -1 || dbPoolIndex > storageReadyIndex) {
  throw new Error("dbPoolPromise must be initialized before storageReady calls initializeStorage");
}

console.log("database storage support checks passed");

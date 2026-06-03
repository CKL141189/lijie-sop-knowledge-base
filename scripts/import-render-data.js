import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT_DIR, "data");
const IMPORT_URL = (process.env.IMPORT_URL || process.env.RENDER_URL || "").replace(/\/+$/, "");
const IMPORT_TOKEN = process.env.IMPORT_TOKEN || "";

if (!IMPORT_URL) {
  throw new Error("請設定 IMPORT_URL，例如 https://lijie-sop-knowledge-base.onrender.com");
}
if (!IMPORT_TOKEN) {
  throw new Error("請設定 IMPORT_TOKEN，且要和 Render Environment 裡的 IMPORT_TOKEN 相同");
}

const payload = {
  taskTemplates: readJsonIfExists("task-templates.json"),
  records: readJsonIfExists("records.json") || [],
  customTasks: readJsonIfExists("custom-tasks.json") || []
};

const response = await fetch(`${IMPORT_URL}/api/admin/import-json`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-import-token": IMPORT_TOKEN
  },
  body: JSON.stringify(payload)
});

const text = await response.text();
const body = text ? JSON.parse(text) : {};
if (!response.ok) {
  throw new Error(body.error || `匯入失敗，HTTP ${response.status}`);
}

console.log(JSON.stringify(body, null, 2));

function readJsonIfExists(filename) {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_PORT = process.env.TEST_PORT || "4011";
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${TEST_PORT}`;
const IMPORT_TOKEN = "legacy-normalization-test";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

const stopServer = async (child) => {
  if (child.exitCode !== null) return;
  await new Promise((resolveStop) => {
    child.once("exit", resolveStop);
    child.kill();
  });
};

const startServer = async (cwd) => {
  const child = spawn(process.execPath, [join(ROOT_DIR, "server.js")], {
    cwd,
    env: { ...process.env, PORT: TEST_PORT, IMPORT_TOKEN, DATABASE_URL: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk.toString()));
  child.stderr.on("data", (chunk) => (output += chunk.toString()));

  for (let index = 0; index < 40; index += 1) {
    if (child.exitCode !== null) throw new Error(`test server exited early:\n${output}`);
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) return child;
    } catch {
      // Keep waiting until the temporary server is ready.
    }
    await wait(100);
  }

  child.kill();
  throw new Error(`test server did not become ready:\n${output}`);
};

const tempRoot = mkdtempSync(join(tmpdir(), "lijie-legacy-record-"));
const server = await startServer(tempRoot);

try {
  const legacyRecord = {
    id: "legacy-string-tags-record",
    phone: "0937844823",
    title: "排班可以單筆變更嗎",
    sourceCategory: "ERP、大二、Google Sheet 欄位",
    knowledgeType: "訂單、派工、完工、序號、庫存查詢方式",
    knowledgeVisibility: "內部知識庫",
    reviewRequirement: "不需人工確認",
    taskId: "legacy-task",
    taskName: "HR每日排班管理",
    taskPeriod: "每日",
    knowledgeQuestion: "排班可以單筆變更嗎",
    knowledgeAnswer: "可以，請到排班管理修改單筆資料。",
    tags: "排班, HR",
    attachments: { originalName: "old-format.pdf", url: "/uploads/legacy/old-format.pdf" },
    status: "待整理",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z"
  };

  const importResponse = await fetch(`${BASE_URL}/api/admin/import-json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-import-token": IMPORT_TOKEN
    },
    body: JSON.stringify({ records: [legacyRecord] })
  });
  assert(importResponse.status === 201, `legacy record import should succeed, got ${importResponse.status}`);

  const recordsResponse = await fetch(`${BASE_URL}/api/records?phone=0937844823`);
  const records = await recordsResponse.json();
  const record = records.find((item) => item.id === legacyRecord.id);
  assert(record, "legacy record should be returned by phone lookup");
  assert(Array.isArray(record.tags), "legacy string tags should be normalized to an array");
  assert(record.tags.join(",") === "排班,HR", "legacy tags should split on commas and keep values");
  assert(Array.isArray(record.attachments), "legacy object attachments should be normalized to an array");
  assert(record.attachments[0]?.originalName === "old-format.pdf", "legacy attachment object should be preserved");

  console.log("legacy record normalization API checks passed");
} finally {
  await stopServer(server);
  rmSync(tempRoot, { recursive: true, force: true });
}

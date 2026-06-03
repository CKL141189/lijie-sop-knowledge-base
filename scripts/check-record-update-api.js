import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_PORT = process.env.TEST_PORT || "4001";
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${TEST_PORT}`;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

const startServer = async () => {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT_DIR,
    env: { ...process.env, PORT: TEST_PORT },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk.toString()));
  child.stderr.on("data", (chunk) => (output += chunk.toString()));

  for (let index = 0; index < 40; index += 1) {
    if (child.exitCode !== null) throw new Error(`test server exited early:\n${output}`);
    try {
      const response = await fetch(`${BASE_URL}/api/records?phone=000`);
      if (response.ok) return child;
    } catch {
      // Keep waiting until the temporary server is ready.
    }
    await wait(100);
  }

  child.kill();
  throw new Error(`test server did not become ready:\n${output}`);
};

const recordForm = (overrides = {}) => {
  const form = new FormData();
  const values = {
    phone: "0911111222",
    title: "Admin edit API test",
    sourceCategory: "API source",
    knowledgeType: "API type",
    knowledgeVisibility: "通用知識庫",
    reviewRequirement: "需人工確認",
    reviewOwner: "客服主管",
    department: "Admin QA",
    role: "Tester",
    interviewee: "Codex",
    taskId: "admin-edit-task",
    taskName: "Admin editable task",
    taskPeriod: "每日",
    knowledgeQuestion: "Original admin question",
    knowledgeAnswer: "Original admin answer",
    status: "待整理",
    ...overrides
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
};

const server = await startServer();
let createdId = "";
try {
  const createResponse = await fetch(`${BASE_URL}/api/records`, {
    method: "POST",
    body: recordForm()
  });
  const created = await createResponse.json();
  createdId = created.id || "";
  assert(createResponse.status === 201, "record should be created");
  assert(createdId, "created record should have id");

  const updateResponse = await fetch(`${BASE_URL}/api/records/${encodeURIComponent(createdId)}`, {
    method: "PUT",
    body: recordForm({
      title: "Updated admin question",
      knowledgeQuestion: "Updated admin question",
      knowledgeAnswer: "Updated admin answer",
      reviewRequirement: "不需人工確認",
      reviewOwner: ""
    })
  });
  const updated = await updateResponse.json();
  assert(updateResponse.ok, "record should be updated");
  assert(updated.id === createdId, "update should keep the same record id");
  assert(updated.knowledgeQuestion === "Updated admin question", "question should update");
  assert(updated.knowledgeAnswer === "Updated admin answer", "answer should update");
  assert(updated.reviewRequirement === "不需人工確認", "review requirement should update");
  assert(updated.reviewOwner === "", "review owner should be clearable");

  const listResponse = await fetch(`${BASE_URL}/api/records?phone=0911111222`);
  const records = await listResponse.json();
  const matches = records.filter((record) => record.id === createdId);
  assert(matches.length === 1, "updated record should not be duplicated");
  assert(matches[0].knowledgeQuestion === "Updated admin question", "list should show updated record");

  const deleteResponse = await fetch(`${BASE_URL}/api/records/${encodeURIComponent(createdId)}`, {
    method: "DELETE"
  });
  const deleted = await deleteResponse.json();
  createdId = "";
  assert(deleteResponse.ok && deleted.ok === true, "record should be deleted");

  console.log("record update API checks passed");
} finally {
  if (createdId) {
    await fetch(`${BASE_URL}/api/records/${encodeURIComponent(createdId)}`, { method: "DELETE" }).catch(() => {});
  }
  server.kill();
}

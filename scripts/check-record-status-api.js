import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_PORT = process.env.TEST_PORT || "3997";
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
      // Wait for the temporary server to start.
    }
    await wait(100);
  }

  child.kill();
  throw new Error(`test server did not become ready:\n${output}`);
};

const baseFormData = (phone, title, status) => {
  const formData = new FormData();
  formData.set("phone", phone);
  formData.set("title", title);
  formData.set("sourceCategory", "客服/工程/維修人員經驗");
  formData.set("knowledgeType", "常見問答、判斷邏輯、客戶話術");
  formData.set("department", "客服部");
  formData.set("role", "客服人員");
  formData.set("interviewee", "測試人員");
  formData.set("taskId", "status-api-test-task");
  formData.set("taskName", "狀態測試任務");
  formData.set("taskPeriod", "每日");
  formData.set("knowledgeQuestion", title);
  formData.set("knowledgeAnswer", "狀態測試答案");
  formData.set("knowledgeVisibility", "通用知識庫");
  formData.set("reviewRequirement", "不需人工確認");
  formData.set("status", status);
  return formData;
};

const server = await startServer();
let createdId = "";
try {
  const phone = "0991002003";
  const title = `狀態欄位測試 ${Date.now()}`;
  const createResponse = await fetch(`${BASE_URL}/api/records`, {
    method: "POST",
    body: baseFormData(phone, title, "須補資料")
  });
  const created = await createResponse.json();
  createdId = created.id || "";

  assert(createResponse.status === 201, `expected create 201, got ${createResponse.status}`);
  assert(created.status === "須補資料", "created record should preserve selected status");

  const updateResponse = await fetch(`${BASE_URL}/api/records/${encodeURIComponent(createdId)}`, {
    method: "PUT",
    body: baseFormData(phone, title, "不可自動回覆")
  });
  const updated = await updateResponse.json();
  assert(updateResponse.ok, `expected update ok, got ${updateResponse.status}`);
  assert(updated.status === "不可自動回復", "legacy status label should be normalized");

  const recordsResponse = await fetch(`${BASE_URL}/api/records?phone=${encodeURIComponent(phone)}`);
  const records = await recordsResponse.json();
  const found = records.find((record) => record.id === createdId);
  assert(found?.status === "不可自動回復", "record list should return normalized status");
  console.log("record status API checks passed");
} finally {
  if (createdId) {
    await fetch(`${BASE_URL}/api/records/${encodeURIComponent(createdId)}`, { method: "DELETE" });
  }
  server.kill();
}

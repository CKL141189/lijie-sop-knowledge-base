import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHOULD_START_SERVER = process.env.START_TEST_SERVER !== "0";
const TEST_PORT = process.env.TEST_PORT || "3998";
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${TEST_PORT}`;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

const startServer = async () => {
  if (!SHOULD_START_SERVER) return null;

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

const runChecks = async () => {
  const phone = "0953372369";
  const uniqueQuestion = `內外部與人工確認測試 ${Date.now()}`;
  let createdId = "";
  const formData = new FormData();
  formData.set("phone", phone);
  formData.set("title", uniqueQuestion);
  formData.set("sourceCategory", "客服/工程/維修人員經驗");
  formData.set("knowledgeType", "常見問答、判斷邏輯、客戶話術");
  formData.set("department", "工程部");
  formData.set("role", "工程部總監");
  formData.set("interviewee", "古朝勳");
  formData.set("taskId", "api-test-task");
  formData.set("taskName", "API 欄位測試任務");
  formData.set("taskPeriod", "突發");
  formData.set("knowledgeQuestion", uniqueQuestion);
  formData.set("knowledgeAnswer", "測試標準答案");
  formData.set("knowledgeVisibility", "外部知識庫");
  formData.set("reviewRequirement", "需人工確認");
  formData.set("reviewOwner", "客服主管");
  formData.set("status", "待整理");

  const createResponse = await fetch(`${BASE_URL}/api/records`, {
    method: "POST",
    body: formData
  });
  const created = await createResponse.json();
  createdId = created.id || "";

  try {
    assert(createResponse.status === 201, `expected create status 201, got ${createResponse.status}`);
    assert(created.knowledgeVisibility === "外部知識庫", "created record should keep knowledge visibility");
    assert(created.reviewRequirement === "需人工確認", "created record should keep review requirement");
    assert(created.reviewOwner === "客服主管", "created record should keep review owner");

    const recordsResponse = await fetch(`${BASE_URL}/api/records?phone=${phone}`);
    const records = await recordsResponse.json();
    const found = records.find((record) => record.id === created.id);
    assert(found, "created record should be returned by phone lookup");
    assert(found.knowledgeVisibility === "外部知識庫", "record list should include knowledge visibility");
    assert(found.reviewRequirement === "需人工確認", "record list should include review requirement");
    assert(found.reviewOwner === "客服主管", "record list should include review owner");
  } finally {
    if (createdId) {
      const deleteResponse = await fetch(`${BASE_URL}/api/records/${encodeURIComponent(createdId)}`, {
        method: "DELETE"
      });
      const deleted = await deleteResponse.json();
      assert(deleteResponse.ok && deleted.ok === true, "created test record should be deleted");
    }
  }
};

const server = await startServer();
try {
  await runChecks();
  console.log("knowledge record field API checks passed");
} finally {
  if (server) server.kill();
}

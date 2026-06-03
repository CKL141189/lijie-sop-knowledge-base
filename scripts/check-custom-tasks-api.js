import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHOULD_START_SERVER = process.env.START_TEST_SERVER !== "0";
const TEST_PORT = process.env.TEST_PORT || "3999";
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${TEST_PORT}`;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  return { response, body };
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
      const response = await fetch(`${BASE_URL}/api/custom-tasks?phone=000`);
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
  const uniqueName = `自動測試自訂任務 ${Date.now()}`;
  const sourceCategory = "ERP、大二、Google Sheet 欄位";
  let createdTaskId = "";

  const createResult = await requestJson("/api/custom-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: "0953-372-369",
      department: "工程部",
      title: "工程部總監",
      person: "古朝勳",
      period: "每月",
      name: uniqueName,
      sourceCategory,
      purpose: "讓人員可把 JSON 沒有的例行任務補進歷史任務參考"
    })
  });

  assert(createResult.response.status === 201, `expected create status 201, got ${createResult.response.status}`);
  assert(createResult.body.id, "created task should include id");
  createdTaskId = createResult.body.id;
  try {
    assert(createResult.body.phone === "0953372369", "created task should normalize phone digits");
    assert(createResult.body.period === "每月", "created task should keep selected period");
    assert(createResult.body.name === uniqueName, "created task should keep task name");
    assert(createResult.body.sourceCategory === sourceCategory, "created task should keep source category");

    const ownerResult = await requestJson("/api/custom-tasks?phone=0953372369");
    assert(ownerResult.response.ok, `expected owner list status 200, got ${ownerResult.response.status}`);
    assert(
      ownerResult.body.some((task) => task.id === createResult.body.id),
      "created task should appear for the same phone"
    );

    const otherResult = await requestJson("/api/custom-tasks?phone=0911222333");
    assert(otherResult.response.ok, `expected other phone list status 200, got ${otherResult.response.status}`);
    assert(
      !otherResult.body.some((task) => task.id === createResult.body.id),
      "created task should not appear for a different phone"
    );
  } finally {
    if (createdTaskId) {
      const deleteResult = await requestJson(`/api/custom-tasks/${encodeURIComponent(createdTaskId)}`, {
        method: "DELETE"
      });
      assert(deleteResult.response.ok, `expected delete status 200, got ${deleteResult.response.status}`);
      assert(deleteResult.body.ok === true, "delete response should confirm deletion");
    }
  }
};

const server = await startServer();
try {
  await runChecks();
  console.log("custom task API checks passed");
} finally {
  if (server) server.kill();
}

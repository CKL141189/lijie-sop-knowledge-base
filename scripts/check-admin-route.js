import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_PORT = process.env.TEST_PORT || "4000";
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
      const response = await fetch(`${BASE_URL}/`);
      if (response.ok) return child;
    } catch {
      // Keep waiting until the temporary server is ready.
    }
    await wait(100);
  }

  child.kill();
  throw new Error(`test server did not become ready:\n${output}`);
};

const server = await startServer();
try {
  for (const path of ["/admin", "/admin/"]) {
    const response = await fetch(`${BASE_URL}${path}`);
    const html = await response.text();
    assert(response.status === 200, `${path} should return 200`);
    assert(html.includes('id="loginScreen"'), `${path} should serve the app shell`);
    assert(html.includes("function openAdminRoute"), `${path} should include admin route bootstrap`);
  }
  console.log("admin route checks passed");
} finally {
  server.kill();
}

import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 3000);
const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = join(ROOT, "data");
const UPLOAD_DIR = join(DATA_DIR, "uploads");
const RECORDS_FILE = join(DATA_DIR, "records.json");
const TASK_TEMPLATES_FILE = join(DATA_DIR, "task-templates.json");
const CUSTOM_TASKS_FILE = join(DATA_DIR, "custom-tasks.json");
const USE_DATABASE = Boolean(process.env.DATABASE_URL);
let dbPoolPromise = null;

ensureDir(DATA_DIR);
ensureDir(UPLOAD_DIR);
if (!USE_DATABASE) {
  if (!existsSync(RECORDS_FILE)) writeJson(RECORDS_FILE, []);
  if (!existsSync(CUSTOM_TASKS_FILE)) writeJson(CUSTOM_TASKS_FILE, []);
}

const storageReady = initializeStorage();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
      return sendJson(res, { ok: true, storage: USE_DATABASE ? "postgres" : "json" });
    }

    if (url.pathname.startsWith("/api/")) await storageReady;

    if (req.method === "GET" && url.pathname === "/api/records") {
      return sendJson(res, await recordsForPhone(url.searchParams.get("phone")));
    }

    if (req.method === "GET" && url.pathname === "/api/profile") {
      const phone = normalizePhone(url.searchParams.get("phone"));
      return sendJson(res, {
        phone,
        profile: await findTaskProfileByPhone(phone),
        records: await recordsForPhone(phone),
        customTasks: await customTasksForPhone(phone)
      });
    }

    if (req.method === "GET" && url.pathname === "/api/task-templates") {
      return sendJson(res, await readTaskTemplates());
    }

    if (req.method === "GET" && url.pathname === "/api/custom-tasks") {
      return sendJson(res, await customTasksForPhone(url.searchParams.get("phone")));
    }

    if (req.method === "POST" && url.pathname === "/api/custom-tasks") {
      const task = await createCustomTask(req);
      return sendJson(res, task, 201);
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/custom-tasks/")) {
      const id = decodeURIComponent(url.pathname.replace("/api/custom-tasks/", ""));
      const deleted = await deleteCustomTask(id);
      return sendJson(res, { ok: deleted });
    }

    if (req.method === "POST" && url.pathname === "/api/records") {
      const record = await createRecord(req);
      return sendJson(res, record, 201);
    }

    if (req.method === "PUT" && url.pathname.startsWith("/api/records/")) {
      const id = decodeURIComponent(url.pathname.replace("/api/records/", ""));
      const record = await updateRecord(id, req);
      return sendJson(res, record);
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/records/")) {
      const id = decodeURIComponent(url.pathname.replace("/api/records/", ""));
      const deleted = await deleteRecord(id);
      return sendJson(res, { ok: deleted });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/import-json") {
      const result = await importJsonData(req);
      return sendJson(res, result, 201);
    }

    if (req.method === "GET" && url.pathname === "/api/export.json") {
      return send(res, 200, JSON.stringify(await readRecords(), null, 2), "application/json; charset=utf-8");
    }

    if (req.method === "GET" && url.pathname === "/api/export.csv") {
      return send(res, 200, "\ufeff" + toCsv(await readRecords()), "text/csv; charset=utf-8", {
        "Content-Disposition": "attachment; filename=\"knowledge-records.csv\""
      });
    }

    if (req.method === "GET" && url.pathname.startsWith("/uploads/")) {
      return serveUpload(url.pathname, res);
    }

    if (req.method === "GET") return serveStatic(url.pathname, res);

    return sendJson(res, { error: "Method not allowed" }, 405);
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: error.message || "Server error" }, error.statusCode || 500);
  }
}).listen(PORT, () => {
  console.log(`Knowledge upload tool running at http://localhost:${PORT}`);
});

async function createRecord(req) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    throw new Error("Expected multipart/form-data");
  }

  const body = await readBody(req);
  const { fields, files } = parseMultipart(body, contentType);
  const id = randomUUID();
  const now = new Date().toISOString();
  const recordDir = join(UPLOAD_DIR, id);
  ensureDir(recordDir);
  const attachments = saveAttachments(id, files);

  const record = {
    id,
    phone: normalizePhone(fields.phone),
    title: cleanText(fields.title),
    sourceCategory: cleanText(fields.sourceCategory),
    knowledgeType: cleanText(fields.knowledgeType),
    knowledgeVisibility: cleanText(fields.knowledgeVisibility || "通用知識庫"),
    reviewRequirement: cleanText(fields.reviewRequirement || "需人工確認"),
    reviewOwner: cleanText(fields.reviewOwner),
    department: cleanText(fields.department),
    role: cleanText(fields.role),
    interviewee: cleanText(fields.interviewee),
    taskId: cleanText(fields.taskId),
    taskName: cleanText(fields.taskName),
    taskPeriod: cleanText(fields.taskPeriod),
    knowledgeQuestion: cleanText(fields.knowledgeQuestion),
    applicableModel: cleanText(fields.applicableModel),
    knowledgeAnswer: cleanText(fields.knowledgeAnswer),
    summary: cleanText(fields.summary),
    rawContent: cleanText(fields.rawContent),
    dailySop: cleanText(fields.dailySop),
    weeklySop: cleanText(fields.weeklySop),
    monthlySop: cleanText(fields.monthlySop),
    specialSop: cleanText(fields.specialSop),
    dailyIssues: cleanText(fields.dailyIssues),
    weeklyIssues: cleanText(fields.weeklyIssues),
    monthlyIssues: cleanText(fields.monthlyIssues),
    specialIssues: cleanText(fields.specialIssues),
    answerSource: cleanText(fields.answerSource),
    troubleshootingSteps: cleanText(fields.troubleshootingSteps),
    knowledgeUpdatedDate: cleanText(fields.knowledgeUpdatedDate),
    tags: splitTags(fields.tags),
    status: normalizeRecordStatus(fields.status),
    notes: cleanText(fields.notes),
    attachments,
    createdAt: now,
    updatedAt: now
  };

  if (!record.title) record.title = `${record.sourceCategory || "未分類資料"} - ${now.slice(0, 10)}`;
  if (!record.sourceCategory) throw new Error("資料來源分類必填");

  await saveRecord(record);
  return record;
}

async function updateRecord(id, req) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    throw new Error("Expected multipart/form-data");
  }

  const body = await readBody(req);
  const { fields, files } = parseMultipart(body, contentType);
  const records = await readRecords();
  const index = records.findIndex((record) => record.id === id);
  if (index === -1) throw new Error("Record not found");

  const current = records[index];
  const attachments = [...(current.attachments || []), ...saveAttachments(id, files)];
  const now = new Date().toISOString();
  const updated = {
    ...current,
    phone: normalizePhone(fields.phone || current.phone),
    title: cleanText(fields.title),
    sourceCategory: cleanText(fields.sourceCategory),
    knowledgeType: cleanText(fields.knowledgeType),
    knowledgeVisibility: cleanText(fields.knowledgeVisibility || current.knowledgeVisibility || "通用知識庫"),
    reviewRequirement: cleanText(fields.reviewRequirement || current.reviewRequirement || "需人工確認"),
    reviewOwner: cleanText("reviewOwner" in fields ? fields.reviewOwner : current.reviewOwner),
    department: cleanText(fields.department),
    role: cleanText(fields.role),
    interviewee: cleanText(fields.interviewee),
    taskId: cleanText(fields.taskId),
    taskName: cleanText(fields.taskName),
    taskPeriod: cleanText(fields.taskPeriod),
    knowledgeQuestion: cleanText(fields.knowledgeQuestion),
    applicableModel: cleanText(fields.applicableModel),
    knowledgeAnswer: cleanText(fields.knowledgeAnswer),
    summary: cleanText(fields.summary),
    rawContent: cleanText(fields.rawContent),
    dailySop: cleanText(fields.dailySop),
    weeklySop: cleanText(fields.weeklySop),
    monthlySop: cleanText(fields.monthlySop),
    specialSop: cleanText(fields.specialSop),
    dailyIssues: cleanText(fields.dailyIssues),
    weeklyIssues: cleanText(fields.weeklyIssues),
    monthlyIssues: cleanText(fields.monthlyIssues),
    specialIssues: cleanText(fields.specialIssues),
    answerSource: cleanText(fields.answerSource),
    troubleshootingSteps: cleanText(fields.troubleshootingSteps),
    knowledgeUpdatedDate: cleanText(fields.knowledgeUpdatedDate),
    tags: splitTags(fields.tags),
    status: normalizeRecordStatus(fields.status || current.status),
    notes: cleanText(fields.notes),
    attachments,
    updatedAt: now
  };

  if (!updated.title) updated.title = `${updated.sourceCategory || "未分類資料"} - ${now.slice(0, 10)}`;
  if (!updated.sourceCategory) throw new Error("資料來源分類必填");

  await saveRecord(updated);
  return updated;
}

async function createCustomTask(req) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Expected application/json");
  }

  const fields = await readJsonBody(req);
  const phone = normalizePhone(fields.phone);
  const name = cleanText(fields.name);
  if (!phone) throw new Error("請輸入電話號碼");
  if (!name) throw new Error("請輸入任務名稱");

  const profile = await findTaskProfileByPhone(phone);
  const now = new Date().toISOString();
  const period = normalizeTaskPeriod(fields.period);
  const task = {
    id: `custom-${randomUUID()}`,
    phone,
    department: cleanText(fields.department || profile?.department),
    person: cleanText(fields.person || profile?.person),
    title: cleanText(fields.title || profile?.title),
    period,
    base: "自訂新增",
    name,
    frequency: period,
    automation: "",
    sop: "自訂新增",
    impact: "",
    input: "",
    tools: cleanText(fields.tools),
    output: cleanText(fields.output),
    purpose: cleanText(fields.purpose),
    sourceCategory: cleanText(fields.sourceCategory),
    trigger: "",
    exception: "",
    wait: "",
    steps: [],
    source: "custom",
    createdAt: now,
    updatedAt: now
  };

  await saveCustomTask(task);
  return task;
}

function saveAttachments(id, files) {
  const recordDir = join(UPLOAD_DIR, id);
  ensureDir(recordDir);
  return files
    .filter((file) => file.filename && file.data.length > 0)
    .map((file) => {
      const safeName = safeFilename(file.filename);
      const storedName = `${Date.now()}-${safeName}`;
      const filePath = join(recordDir, storedName);
      writeFileSync(filePath, file.data);
      return {
        originalName: file.filename,
        storedName,
        size: file.data.length,
        type: file.contentType || "application/octet-stream",
        url: `/uploads/${encodeURIComponent(id)}/${encodeURIComponent(storedName)}`
      };
    });
}

async function deleteRecord(id) {
  if (USE_DATABASE) {
    const result = await dbQuery("DELETE FROM records WHERE id = $1", [id]);
    const recordDir = join(UPLOAD_DIR, id);
    if (existsSync(recordDir)) rmSync(recordDir, { recursive: true, force: true });
    return result.rowCount > 0;
  }

  const records = await readRecords();
  const next = records.filter((record) => record.id !== id);
  if (next.length === records.length) return false;
  writeJson(RECORDS_FILE, next);
  const recordDir = join(UPLOAD_DIR, id);
  if (existsSync(recordDir)) rmSync(recordDir, { recursive: true, force: true });
  return true;
}

async function deleteCustomTask(id) {
  if (USE_DATABASE) {
    const result = await dbQuery("DELETE FROM custom_tasks WHERE id = $1", [id]);
    return result.rowCount > 0;
  }

  const tasks = await readCustomTasks();
  const next = tasks.filter((task) => task.id !== id);
  if (next.length === tasks.length) return false;
  writeCustomTasks(next);
  return true;
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const body = await readBody(req);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new Error("Expected valid JSON body");
  }
}

function parseMultipart(body, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("Missing multipart boundary");

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const parts = splitBuffer(body, boundary);
  const fields = {};
  const files = [];

  for (const part of parts) {
    let chunk = trimBoundaryPart(part);
    if (chunk.length === 0 || chunk.equals(Buffer.from("--"))) continue;

    const headerEnd = chunk.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;

    const headerText = chunk.subarray(0, headerEnd).toString("utf8");
    let data = chunk.subarray(headerEnd + 4);
    if (data.subarray(-2).toString() === "\r\n") data = data.subarray(0, -2);

    const disposition = headerText.match(/content-disposition:[^\n]+/i)?.[0] || "";
    const name = disposition.match(/name="([^"]+)"/i)?.[1];
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1];
    const contentTypeLine = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim();
    if (!name) continue;

    if (filename !== undefined) {
      files.push({ field: name, filename, contentType: contentTypeLine, data });
    } else {
      fields[name] = data.toString("utf8");
    }
  }

  return { fields, files };
}

function splitBuffer(buffer, delimiter) {
  const parts = [];
  let start = 0;
  let index = buffer.indexOf(delimiter, start);
  while (index !== -1) {
    parts.push(buffer.subarray(start, index));
    start = index + delimiter.length;
    index = buffer.indexOf(delimiter, start);
  }
  parts.push(buffer.subarray(start));
  return parts;
}

function trimBoundaryPart(part) {
  let start = 0;
  let end = part.length;
  if (part.subarray(0, 2).toString() === "\r\n") start = 2;
  if (part.subarray(end - 2).toString() === "\r\n") end -= 2;
  return part.subarray(start, end);
}

function serveStatic(pathname, res) {
  const requestPath = pathname === "/" || pathname === "/admin" || pathname === "/admin/" ? "/index.html" : pathname;
  const filePath = safeJoin(PUBLIC_DIR, decodeURIComponent(requestPath));
  if (!filePath || !existsSync(filePath)) return send(res, 404, "Not found", "text/plain; charset=utf-8");
  streamFile(filePath, res);
}

function serveUpload(pathname, res) {
  const filePath = safeJoin(DATA_DIR, decodeURIComponent(pathname));
  if (!filePath || !existsSync(filePath)) return send(res, 404, "Not found", "text/plain; charset=utf-8");
  streamFile(filePath, res);
}

function streamFile(filePath, res) {
  const type = MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  createReadStream(filePath).pipe(res);
}

function safeJoin(base, requestPath) {
  const cleanPath = requestPath.replace(/^[/\\]+/, "");
  const target = resolve(base, normalize(cleanPath));
  const root = resolve(base);
  return target.startsWith(root) ? target : null;
}

async function initializeStorage() {
  if (!USE_DATABASE) return;

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS task_templates (
      key text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS records (
      id text PRIMARY KEY,
      phone text,
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await dbQuery("CREATE INDEX IF NOT EXISTS records_phone_idx ON records (phone)");
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS custom_tasks (
      id text PRIMARY KEY,
      phone text,
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await dbQuery("CREATE INDEX IF NOT EXISTS custom_tasks_phone_idx ON custom_tasks (phone)");
  await seedTaskTemplatesFromLocalFile();
}

async function getDbPool() {
  if (!dbPoolPromise) {
    dbPoolPromise = (async () => {
      const { Pool } = await import("pg");
      const options = { connectionString: process.env.DATABASE_URL };
      if (process.env.DATABASE_SSL === "true" || process.env.DATABASE_URL.includes("sslmode=require")) {
        options.ssl = { rejectUnauthorized: false };
      }
      return new Pool(options);
    })();
  }
  return dbPoolPromise;
}

async function dbQuery(sql, params = []) {
  const pool = await getDbPool();
  return pool.query(sql, params);
}

async function seedTaskTemplatesFromLocalFile() {
  const existing = await dbQuery("SELECT key FROM task_templates WHERE key = $1", ["default"]);
  if (existing.rowCount > 0) return;

  const templates = readTaskTemplatesFile();
  if (!templates.people?.length) return;
  await writeTaskTemplates(templates);
}

async function writeTaskTemplates(templates) {
  if (USE_DATABASE) {
    await dbQuery(
      `
        INSERT INTO task_templates (key, data, updated_at)
        VALUES ($1, $2::jsonb, now())
        ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
      `,
      ["default", JSON.stringify(templates || [])]
    );
    return;
  }

  writeJson(TASK_TEMPLATES_FILE, templates || []);
}

async function saveRecord(record) {
  const normalizedInput = normalizeRecord(record);
  if (USE_DATABASE) {
    const createdAt = normalizedInput.createdAt || new Date().toISOString();
    const updatedAt = normalizedInput.updatedAt || createdAt;
    const normalizedRecord = { ...normalizedInput, createdAt, updatedAt };
    await dbQuery(
      `
        INSERT INTO records (id, phone, data, created_at, updated_at)
        VALUES ($1, $2, $3::jsonb, $4, $5)
        ON CONFLICT (id) DO UPDATE
        SET phone = EXCLUDED.phone, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
      `,
      [
        normalizedRecord.id,
        normalizePhone(normalizedRecord.phone),
        JSON.stringify(normalizedRecord),
        normalizedRecord.createdAt,
        normalizedRecord.updatedAt
      ]
    );
    return normalizedRecord;
  }

  const records = await readRecords();
  const index = records.findIndex((item) => item.id === normalizedInput.id);
  if (index === -1) records.push(normalizedInput);
  else records[index] = normalizedInput;
  writeJson(RECORDS_FILE, records);
  return normalizedInput;
}

async function saveCustomTask(task) {
  if (USE_DATABASE) {
    const createdAt = task.createdAt || new Date().toISOString();
    const updatedAt = task.updatedAt || createdAt;
    const normalizedTask = { ...task, createdAt, updatedAt };
    await dbQuery(
      `
        INSERT INTO custom_tasks (id, phone, data, created_at, updated_at)
        VALUES ($1, $2, $3::jsonb, $4, $5)
        ON CONFLICT (id) DO UPDATE
        SET phone = EXCLUDED.phone, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
      `,
      [
        normalizedTask.id,
        normalizePhone(normalizedTask.phone),
        JSON.stringify(normalizedTask),
        normalizedTask.createdAt,
        normalizedTask.updatedAt
      ]
    );
    return normalizedTask;
  }

  const tasks = await readCustomTasks();
  const index = tasks.findIndex((item) => item.id === task.id);
  if (index === -1) tasks.push(task);
  else tasks[index] = task;
  writeCustomTasks(tasks);
  return task;
}

async function importJsonData(req) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("application/json")) throw new Error("Expected application/json");

  const fields = await readJsonBody(req);
  const configuredToken = process.env.IMPORT_TOKEN;
  const providedToken = cleanText(req.headers["x-import-token"] || fields.token);
  if (!configuredToken) throw httpError("匯入功能尚未設定 IMPORT_TOKEN", 403);
  if (providedToken !== configuredToken) throw httpError("匯入授權失敗", 403);

  const result = {
    taskTemplates: 0,
    records: 0,
    customTasks: 0
  };

  if (fields.taskTemplates) {
    await writeTaskTemplates(fields.taskTemplates);
    result.taskTemplates = fields.taskTemplates.people?.length || 1;
  }
  if (Array.isArray(fields.records)) {
    for (const record of fields.records) await saveRecord(record);
    result.records = fields.records.length;
  }
  if (Array.isArray(fields.customTasks)) {
    for (const task of fields.customTasks) await saveCustomTask(task);
    result.customTasks = fields.customTasks.length;
  }

  return { ok: true, imported: result, storage: USE_DATABASE ? "postgres" : "json" };
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function readRecords() {
  if (USE_DATABASE) {
    const result = await dbQuery("SELECT data FROM records ORDER BY created_at DESC");
    return result.rows.map((row) => normalizeRecord(row.data));
  }

  try {
    return JSON.parse(readFileSync(RECORDS_FILE, "utf8")).map((record) => normalizeRecord(record));
  } catch {
    return [];
  }
}

async function recordsForPhone(phoneValue = "") {
  const phone = normalizePhone(phoneValue);
  const records = (await readRecords()).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  if (!phone) return records;
  const profile = await findTaskProfileByPhone(phone);
  return records.filter((record) => {
    if (normalizePhone(record.phone) === phone) return true;
    return !record.phone && profile?.person && cleanText(record.interviewee) === profile.person;
  });
}

async function readTaskTemplates() {
  if (USE_DATABASE) {
    const result = await dbQuery("SELECT data FROM task_templates WHERE key = $1", ["default"]);
    return result.rows[0]?.data || [];
  }

  return readTaskTemplatesFile();
}

function readTaskTemplatesFile() {
  try {
    return JSON.parse(readFileSync(TASK_TEMPLATES_FILE, "utf8"));
  } catch {
    return [];
  }
}

async function readCustomTasks() {
  if (USE_DATABASE) {
    const result = await dbQuery("SELECT data FROM custom_tasks ORDER BY created_at ASC");
    return result.rows.map((row) => row.data);
  }

  try {
    const tasks = JSON.parse(readFileSync(CUSTOM_TASKS_FILE, "utf8"));
    return Array.isArray(tasks) ? tasks : [];
  } catch {
    return [];
  }
}

function writeCustomTasks(tasks) {
  writeJson(CUSTOM_TASKS_FILE, tasks);
}

async function customTasksForPhone(phoneValue = "") {
  const phone = normalizePhone(phoneValue);
  const tasks = (await readCustomTasks()).sort((a, b) => {
    const aTime = a.createdAt || "";
    const bTime = b.createdAt || "";
    return aTime.localeCompare(bTime);
  });
  if (!phone) return tasks;
  return tasks.filter((task) => normalizePhone(task.phone) === phone);
}

async function findTaskProfileByPhone(phoneValue = "") {
  const phone = normalizePhone(phoneValue);
  if (!phone) return null;
  const templates = await readTaskTemplates();
  return (templates.people || []).find((group) => normalizePhone(group.phone) === phone) || null;
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function cleanText(value = "") {
  return String(value).trim();
}

function normalizeRecord(record = {}) {
  const normalized = { ...record };
  normalized.phone = normalizePhone(normalized.phone);
  normalized.knowledgeVisibility = cleanText(normalized.knowledgeVisibility || "通用知識庫");
  normalized.reviewRequirement = cleanText(normalized.reviewRequirement || "需人工確認");
  normalized.reviewOwner = cleanText(normalized.reviewOwner);
  normalized.tags = normalizeTags(normalized.tags);
  normalized.attachments = normalizeAttachments(normalized.attachments);
  normalized.status = normalizeRecordStatus(normalized.status);
  return normalized;
}

function normalizeRecordStatus(value = "") {
  const text = cleanText(value);
  if (text === "需補資料") return "須補資料";
  if (text === "不可自動回覆") return "不可自動回復";
  const allowed = new Set(["待整理", "待主管確認", "須補資料", "可直接添加入知識庫", "不可自動回復"]);
  return allowed.has(text) ? text : "待整理";
}

function normalizePhone(value = "") {
  return String(value).replace(/\D/g, "");
}

function normalizeTaskPeriod(value = "") {
  const period = cleanText(value).replace("每周", "每週");
  const allowed = new Set(["每日", "每週", "每月", "突發", "不定期", "每季", "年度", "其他"]);
  return allowed.has(period) ? period : "不定期";
}

function splitTags(value = "") {
  return String(value)
    .split(/[,，#\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeTags(value = "") {
  if (Array.isArray(value)) return value.map((tag) => cleanText(tag)).filter(Boolean);
  return splitTags(value);
}

function normalizeAttachments(value = []) {
  const files = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return files
    .filter((file) => file && typeof file === "object")
    .map((file) => {
      const normalized = { ...file };
      normalized.originalName = cleanText(file.originalName || file.filename || file.name || "附件");
      normalized.storedName = cleanText(file.storedName);
      normalized.type = cleanText(file.type || file.contentType || "application/octet-stream");
      normalized.url = cleanText(file.url);
      normalized.size = Number(file.size || 0);
      return normalized;
    });
}

function safeFilename(filename) {
  const fallback = "attachment";
  const cleaned = filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

function sendJson(res, value, status = 200) {
  return send(res, status, JSON.stringify(value), "application/json; charset=utf-8");
}

function send(res, status, body, contentType, headers = {}) {
  res.writeHead(status, { "Content-Type": contentType, ...headers });
  res.end(body);
}

function toCsv(records) {
  const columns = [
    ["id", "ID"],
    ["phone", "電話"],
    ["title", "標題"],
    ["sourceCategory", "資料來源"],
    ["knowledgeType", "可整理知識"],
    ["knowledgeVisibility", "知識庫類型"],
    ["reviewRequirement", "這個需不需要人工確認"],
    ["reviewOwner", "給誰確認"],
    ["department", "部門"],
    ["role", "職位"],
    ["interviewee", "填寫人"],
    ["taskId", "歷史任務ID"],
    ["taskName", "歷史任務"],
    ["taskPeriod", "任務期間"],
    ["knowledgeQuestion", "客戶問題/問法"],
    ["applicableModel", "適用型號/情境"],
    ["knowledgeAnswer", "標準答案"],
    ["summary", "摘要"],
    ["rawContent", "整體補充說明"],
    ["dailySop", "每日任務SOP"],
    ["weeklySop", "每週任務SOP"],
    ["monthlySop", "每月任務SOP"],
    ["specialSop", "特殊任務SOP"],
    ["dailyIssues", "每日會遇到的問題"],
    ["weeklyIssues", "每週會遇到的問題"],
    ["monthlyIssues", "每月會遇到的問題"],
    ["specialIssues", "特殊任務會遇到的問題"],
    ["answerSource", "SOP參考來源"],
    ["troubleshootingSteps", "共通判斷/升級規則"],
    ["knowledgeUpdatedDate", "最後更新日期"],
    ["tags", "標籤"],
    ["status", "狀態"],
    ["notes", "備註"],
    ["attachments", "附件"],
    ["createdAt", "建立時間"]
  ];
  const rows = [columns.map(([, label]) => label)];
  for (const record of records) {
    rows.push(
      columns.map(([key]) => {
        if (key === "tags") return (record.tags || []).join("、");
        if (key === "attachments") return (record.attachments || []).map((file) => file.originalName).join("、");
        return record[key] || "";
      })
    );
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function csvCell(value) {
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

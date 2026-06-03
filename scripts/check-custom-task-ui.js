import { readFileSync } from "node:fs";

const html = readFileSync("public/index.html", "utf8");

const requiredSnippets = [
  'id="customTaskPeriod"',
  'id="customTaskName"',
  'id="customTaskPurpose"',
  'id="addCustomTaskButton"',
  'function createCustomTask',
  'function activeProfileTaskGroup',
  'fetch("/api/custom-tasks"',
  'source === "custom"',
  'id="knowledgeVisibility"',
  'id="reviewRequirement"',
  'id="reviewOwnerField"',
  'id="reviewOwner"',
  'id="reviewOwnerOptions"',
  'function updateReviewOwnerField',
  'function resetSessionUiState',
  'function isAdminRoute',
  'function openAdminRoute',
  'id="adminToggleButton" type="button" hidden',
  'id="exportCsvLink" href="/api/export.csv" hidden',
  'id="exportJsonLink" href="/api/export.json" hidden',
  'id="adminTaskOverview" hidden',
  'function loadAdminCustomTasks',
  'function adminTaskItems',
  'function renderAdminTaskOverview',
  'function adminTaskElement',
  'window.location.pathname === "/admin"',
  'method: isEditing ? "PUT" : "POST"',
  'edit.addEventListener("click", () => editRecord(record.id))',
  'setFormValue("knowledgeQuestion", record.knowledgeQuestion || record.title || "");',
  'setFormValue("applicableModel", record.applicableModel || "");',
  'setFormValue("knowledgeAnswer", record.knowledgeAnswer || record.rawContent || "");',
  'resetSessionUiState();',
  'localStorage.removeItem("sopLoginPhone")',
  'setFormValue("department", state.profile?.department || "");',
  'if (!state.adminMode && !state.phone)',
  'function knowledgePromptForTask',
  'function updateKnowledgePlaceholders',
  '內部知識庫',
  '外部知識庫',
  '通用知識庫',
  '需人工確認',
  '不需人工確認',
  '條件式人工確認',
  '給誰確認',
  '行銷主管',
  '客服主管',
  '工程主管'
];

const missing = requiredSnippets.filter((snippet) => !html.includes(snippet));
if (missing.length) {
  throw new Error(`missing custom task UI snippets:\n${missing.join("\n")}`);
}

const forbiddenEmployeeSnippets = [
  'class="login-admin-link"',
  'href="/admin">前往後台查看全部資料</a>',
  '後台：查看全部'
];
const forbidden = forbiddenEmployeeSnippets.filter((snippet) => html.includes(snippet));
if (forbidden.length) {
  throw new Error(`employee-facing UI should not expose admin entry snippets:\n${forbidden.join("\n")}`);
}

const visibilitySelect = html.match(/<select id="knowledgeVisibility"[\s\S]*?<\/select>/)?.[0] || "";
const reviewSelect = html.match(/<select id="reviewRequirement"[\s\S]*?<\/select>/)?.[0] || "";
if (!visibilitySelect) throw new Error("knowledgeVisibility select not found");
if (!reviewSelect) throw new Error("reviewRequirement select not found");
for (const value of ["內部知識庫", "外部知識庫", "通用知識庫"]) {
  if (!visibilitySelect.includes(`value="${value}"`)) throw new Error(`knowledgeVisibility missing option ${value}`);
}
for (const value of ["需人工確認", "不需人工確認", "條件式人工確認"]) {
  if (!reviewSelect.includes(`value="${value}"`)) throw new Error(`reviewRequirement missing option ${value}`);
}
if (/<select id="knowledgeVisibility"[^>]*disabled/.test(visibilitySelect)) {
  throw new Error("knowledgeVisibility should be selectable before choosing a task");
}
if (/<select id="reviewRequirement"[^>]*disabled/.test(reviewSelect)) {
  throw new Error("reviewRequirement should be selectable before choosing a task");
}
if (html.includes("if (!els.form.elements.department.value)")) {
  throw new Error("profile fields should be overwritten on phone login, not kept from the previous user");
}
if (html.includes("if (!els.form.elements.role.value)")) {
  throw new Error("role should be overwritten on phone login, not kept from the previous user");
}
if (html.includes("if (!els.form.elements.interviewee.value)")) {
  throw new Error("interviewee should be overwritten on phone login, not kept from the previous user");
}

const ownerField = html.match(/<div class="field" id="reviewOwnerField"[\s\S]*?<\/div>/)?.[0] || "";
if (!ownerField) throw new Error("reviewOwnerField not found");
for (const value of ["行銷主管", "客服主管", "工程主管"]) {
  if (!html.includes(`value="${value}"`)) throw new Error(`reviewOwnerOptions missing ${value}`);
}

console.log("custom task UI checks passed");

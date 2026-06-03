import { readFileSync } from "node:fs";

const html = readFileSync("public/index.html", "utf8");

const requiredSnippets = [
  '<section class="knowledge-entry" id="knowledgeEntry" hidden>',
  '<div class="submit-row" id="submitRow" hidden>',
  'knowledgeEntry: document.querySelector("#knowledgeEntry")',
  'submitRow: document.querySelector("#submitRow")',
  'function setKnowledgeEntryVisible(visible)',
  'els.knowledgeEntry.hidden = !visible;',
  'els.submitRow.hidden = !visible;',
  'function startAdminKnowledgeEntry(task)',
  'adminStart.addEventListener("click", () => startAdminKnowledgeEntry(task));',
  'const taskPhone = phoneDigits(task.phone || task.displayPhone || state.phone || els.form.elements.phone.value);',
  'setFormValue("phone", taskPhone);',
  'setFormValue("department", task.department || state.profile?.department || els.form.elements.department.value || "");',
  '資料來源分類會依 JSON 與新增任務內容統計任務數'
];

const missing = requiredSnippets.filter((snippet) => !html.includes(snippet));
if (missing.length) {
  throw new Error(`missing admin knowledge-entry snippets:\n${missing.join("\n")}`);
}

console.log("admin knowledge-entry UI checks passed");

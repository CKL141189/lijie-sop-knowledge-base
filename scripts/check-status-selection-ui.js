import { readFileSync } from "node:fs";

const html = readFileSync("public/index.html", "utf8");

const requiredSnippets = [
  "const recordStatuses = [",
  '"待整理"',
  '"待主管確認"',
  '"須補資料"',
  '"可直接添加入知識庫"',
  '"不可自動回復"',
  '<select id="status" name="status"></select>',
  'statusSelect: document.querySelector("#status")',
  "function hydrateStatusSelects()",
  "function normalizeRecordStatus(value = \"\")",
  "els.statusSelect.value = \"待整理\";",
  "setFormValue(\"status\", normalizeRecordStatus(record.status || \"待整理\"));",
  "if (state.status && normalizeRecordStatus(record.status) !== state.status) return false;"
];

const missing = requiredSnippets.filter((snippet) => !html.includes(snippet));
if (missing.length) {
  throw new Error(`missing status selection UI snippets:\n${missing.join("\n")}`);
}

if (html.includes('<input id="status" name="status" type="hidden"')) {
  throw new Error("status should be a visible select in the knowledge form, not a hidden input");
}

console.log("status selection UI checks passed");

import { readFileSync } from "node:fs";

const html = readFileSync("public/index.html", "utf8");

const requiredSnippets = [
  'id="customTaskSourceCategory"',
  'customTaskSourceCategory: document.querySelector("#customTaskSourceCategory")',
  'els.customTaskSourceCategory.append(new Option("請選擇資料來源分類", ""))',
  'const sourceCategory = els.customTaskSourceCategory.value',
  '請先選擇資料來源分類',
  'sourceCategory,',
  'els.customTaskSourceCategory.value = ""'
];

const missing = requiredSnippets.filter((snippet) => !html.includes(snippet));
if (missing.length) {
  throw new Error(`missing custom task source category snippets:\n${missing.join("\n")}`);
}

const panel = html.match(/<div class="custom-task-panel" id="customTaskPanel"[\s\S]*?<select id="templateSelector"/)?.[0] || "";
if (!panel) throw new Error("custom task panel not found");
if (!panel.includes('for="customTaskSourceCategory"')) {
  throw new Error("custom task panel should show a source category label");
}
if (!panel.includes("資料來源分類")) {
  throw new Error("custom task panel should display 資料來源分類");
}

console.log("custom task source category UI checks passed");

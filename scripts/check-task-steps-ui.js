import { readFileSync } from "node:fs";

const html = readFileSync("public/index.html", "utf8");

const requiredSnippets = [
  "function taskStepsElement(task = {})",
  "原始處理步驟",
  "尚未提供處理步驟",
  "task.steps.map((step, index)",
  "item.append(head, meta, purpose, taskStepsElement(task), button)",
  "className = \"task-steps\"",
  "className = \"task-steps-list\""
];

const missing = requiredSnippets.filter((snippet) => !html.includes(snippet));
if (missing.length) {
  throw new Error(`missing task steps UI snippets:\n${missing.join("\n")}`);
}

console.log("task steps UI checks passed");

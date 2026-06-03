import { readFileSync } from "node:fs";

const html = readFileSync("public/index.html", "utf8");

const requiredSnippets = [
  "function taskSourceCategory(task = {})",
  "function taskCategoryText(task = {})",
  "function visibleTaskItems()",
  "function taskCategoryCounts()",
  "counts.set(\"\", tasks.length);",
  "task.sourceCategory = taskSourceCategory(task);",
  "if (state.category && item.sourceCategory !== state.category) return false;",
  "const filteredTasks = state.category ? group.tasks.filter((task) => taskSourceCategory(task) === state.category) : group.tasks;",
  "button.querySelector(\".count\").textContent = counts.get(value ? label : \"\") || 0;",
  "sourceCategory: task.sourceCategory || taskSourceCategory(task),"
];

const missing = requiredSnippets.filter((snippet) => !html.includes(snippet));
if (missing.length) {
  throw new Error(`missing task category filter snippets:\n${missing.join("\n")}`);
}

if (html.includes("counts.set(\"\", state.records.length);")) {
  throw new Error("category sidebar should count JSON/custom tasks, not only submitted records");
}

console.log("task category filter UI checks passed");

import { readFileSync } from "node:fs";

const html = readFileSync("public/index.html", "utf8");
const server = readFileSync("server.js", "utf8");

const requiredSnippets = [
  '<label for="reviewRequirement">這個需不需要人工確認</label>',
  "<strong>這個需不需要人工確認</strong>"
];

const missing = requiredSnippets.filter((snippet) => !html.includes(snippet));
if (missing.length) {
  throw new Error(`missing review requirement label snippets:\n${missing.join("\n")}`);
}

if (html.includes('<label for="reviewRequirement">人工確認</label>')) {
  throw new Error("reviewRequirement form label should no longer be 人工確認");
}
if (html.includes("<strong>人工確認</strong>")) {
  throw new Error("record detail label should no longer be 人工確認");
}
if (!server.includes('["reviewRequirement", "這個需不需要人工確認"]')) {
  throw new Error("CSV header should be 這個需不需要人工確認");
}
if (server.includes('["reviewRequirement", "人工確認"]')) {
  throw new Error("CSV header should no longer be 人工確認");
}

console.log("review requirement label UI checks passed");

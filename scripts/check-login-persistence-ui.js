import { readFileSync } from "node:fs";

const html = readFileSync("public/index.html", "utf8");

const requiredSnippets = [
  "function restoreSavedLogin",
  "function loadPhoneSession",
  "localStorage.setItem(\"sopLoginPhone\", phone)",
  "phoneDigits(localStorage.getItem(\"sopLoginPhone\"))",
  "templatesReady.finally(restoreSavedLogin)",
  "localStorage.removeItem(\"sopLoginPhone\")"
];

const missing = requiredSnippets.filter((snippet) => !html.includes(snippet));
if (missing.length) {
  throw new Error(`missing login persistence snippets:\n${missing.join("\n")}`);
}

const initBlock = html.match(/function init\(\) \{[\s\S]*?function isAdminRoute/)?.[0] || "";
if (!initBlock) throw new Error("init block not found");
if (initBlock.includes("localStorage.removeItem(\"sopLoginPhone\")")) {
  throw new Error("init should not clear sopLoginPhone on refresh");
}

const logoutBlock = html.match(/function logout\(\) \{[\s\S]*?async function openAdminRoute/)?.[0] || "";
if (!logoutBlock) throw new Error("logout block not found");
if (!logoutBlock.includes("localStorage.removeItem(\"sopLoginPhone\")")) {
  throw new Error("logout should clear sopLoginPhone");
}

console.log("login persistence UI checks passed");

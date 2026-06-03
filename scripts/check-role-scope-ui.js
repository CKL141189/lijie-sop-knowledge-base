import { readFileSync } from "node:fs";

const html = readFileSync("public/index.html", "utf8");

const requiredSnippets = [
  'id="roleOverviewBox" hidden',
  'id="roleOverviewTitle"',
  'id="roleOverviewResponsibilities"',
  'id="adminRoleOverview" hidden',
  'id="adminRoleList"',
  'roleOverviewBox: document.querySelector("#roleOverviewBox")',
  'adminRoleOverview: document.querySelector("#adminRoleOverview")',
  'function roleScopeGroups()',
  'function roleScopeFromGroup(group = {}, options = {})',
  'function renderRoleOverview()',
  'function renderAdminRoleOverview()',
  'function roleScopeCard(scope)',
  '後續新增任務會自動併入此職位範圍',
  '幫助新人快速了解這個職位需要做的事情',
  'renderRoleOverview();',
  'renderAdminRoleOverview();'
];

const missing = requiredSnippets.filter((snippet) => !html.includes(snippet));
if (missing.length) {
  throw new Error(`missing role scope UI snippets:\n${missing.join("\n")}`);
}

console.log("role scope UI checks passed");

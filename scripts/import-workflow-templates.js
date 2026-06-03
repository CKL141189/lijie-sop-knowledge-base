import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sourcePath = process.argv[2] || "C:/Users/RAY/Downloads/workflow_export_20260525.json";
const outputPath = process.argv[3] || "data/task-templates.json";

if (!existsSync(sourcePath)) {
  console.error(`Source file not found: ${sourcePath}`);
  process.exit(1);
}

const rows = JSON.parse(readFileSync(sourcePath, "utf8"));
const templates = [];

for (const row of rows) {
  if (!row.completed || !row.data) continue;
  const data = row.data;
  const department = clean(data.p0_dept);
  const person = clean(data.p0_name);
  const title = clean(data.p0_title);
  const phone = normalizePhone(row.phone);
  if (!title || title === "1") continue;

  const taskKeys = Object.keys(data)
    .filter((key) => /^p\d+_\d+_name$/.test(key) && clean(data[key]))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const key of taskKeys) {
    const base = key.replace("_name", "");
    const task = {
      id: `${row.phone || person}-${base}`,
      phone,
      department,
      person,
      title,
      period: inferPeriod(base, data[`${base}_freq`], data[key]),
      base,
      name: clean(data[key]),
      frequency: clean(data[`${base}_freq`]),
      automation: arrayText(data[`${base}_auto`]),
      sop: clean(data[`${base}_sop`] || data[`${base.split("_").slice(0, 2).join("_")}_sop`]),
      impact: clean(data[`${base}_impact`]),
      input: clean(data[`${base}_input`]),
      tools: clean(data[`${base}_tools`]),
      output: clean(data[`${base}_output`]),
      purpose: clean(data[`${base}_purpose`]),
      trigger: clean(data[`${base}_trigger`]),
      exception: clean(data[`${base}_exception`]),
      wait: clean(data[`${base}_wait`]),
      steps: collectSteps(data, base)
    };
    templates.push(task);
  }
}

const grouped = groupTemplates(templates);
mkdirSync(dirname(resolve(outputPath)), { recursive: true });
writeFileSync(outputPath, JSON.stringify(grouped, null, 2), "utf8");
console.log(`Imported ${templates.length} tasks into ${outputPath}`);

function groupTemplates(items) {
  const people = new Map();
  const roles = new Map();

  for (const item of items) {
    const personKey = `${item.department}||${item.title}||${item.person}`;
    if (!people.has(personKey)) {
      people.set(personKey, {
        key: personKey,
        phone: item.phone,
        department: item.department,
        title: item.title,
        person: item.person,
        tasks: []
      });
    }
    if (!people.get(personKey).phone && item.phone) people.get(personKey).phone = item.phone;
    people.get(personKey).tasks.push(item);

    const roleKey = `${item.department}||${item.title}`;
    if (!roles.has(roleKey)) {
      roles.set(roleKey, {
        key: roleKey,
        department: item.department,
        title: item.title,
        people: new Set(),
        tasks: []
      });
    }
    roles.get(roleKey).people.add(item.person);
    roles.get(roleKey).tasks.push(item);
  }

  return {
    generatedAt: new Date().toISOString(),
    people: [...people.values()].map(sortTaskGroup),
    roles: [...roles.values()].map((role) =>
      sortTaskGroup({
        ...role,
        people: [...role.people].filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-Hant"))
      })
    )
  };
}

function sortTaskGroup(group) {
  group.tasks.sort((a, b) => {
    const periodOrder = periodRank(a.period) - periodRank(b.period);
    if (periodOrder !== 0) return periodOrder;
    return a.name.localeCompare(b.name, "zh-Hant");
  });
  return group;
}

function periodRank(period) {
  return ["每日", "每週", "每月", "每季", "年度", "不定期", "突發", "其他"].indexOf(period);
}

function inferPeriod(base, freq = "", name = "") {
  const text = `${freq} ${name}`;
  if (/每天|每日|天天/.test(text)) return "每日";
  if (/每週|每周|一週|週|周/.test(text)) return "每週";
  if (/每月|月底|月初|月結|每個月|每月/.test(text)) return "每月";
  if (/每季|季度|季/.test(text)) return "每季";
  if (/每年|年度|半年|一年/.test(text)) return "年度";
  if (/臨時|緊急|突發|客訴|取消|改地址|改時間|插隊|異常/.test(text)) return "突發";
  if (/不定|偶爾|很少|不一定|暫定/.test(text)) return "不定期";

  const page = Number(base.match(/^p(\d+)_/)?.[1] || 0);
  if (page === 1) return "每日";
  if (page === 2) return "每週";
  if (page === 3) return "每月";
  if (page === 4) return "不定期";
  if (page === 5) return "突發";
  return "其他";
}

function collectSteps(data, base) {
  return Object.keys(data)
    .filter((key) => key.startsWith(`${base}_step_`) && clean(data[key]))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((key) => clean(data[key]));
}

function arrayText(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).join("、");
  return clean(value);
}

function clean(value = "") {
  return String(value).trim();
}

function normalizePhone(value = "") {
  return String(value).replace(/\D/g, "");
}

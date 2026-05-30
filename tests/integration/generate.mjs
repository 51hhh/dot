// 用法: node tests/integration/generate.mjs <output_path> <id1> <id2> ...
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const [outputPath, ...selectedIds] = process.argv.slice(2);

const config = yaml.load(fs.readFileSync("configs/tmux.yaml", "utf-8"));
const allNodes = new Map();
function walk(nodes) {
  for (const n of nodes) {
    allNodes.set(n.id, n);
    if (n.children) walk(n.children);
  }
}
walk(config.menu);

const selected = new Set(selectedIds);

function resolveDeps(ids) {
  const r = new Set(ids);
  const q = [...ids];
  while (q.length) {
    const id = q.pop();
    const n = allNodes.get(id);
    if (!n?.deps) continue;
    for (const d of n.deps) {
      if (!r.has(d)) {
        r.add(d);
        q.push(d);
      }
    }
  }
  return r;
}

function topoSort(ids) {
  const inD = new Map();
  const deps = new Map();
  for (const id of ids) inD.set(id, 0);
  for (const id of ids) {
    const n = allNodes.get(id);
    if (!n?.deps) continue;
    for (const d of n.deps) {
      if (!ids.has(d)) continue;
      inD.set(id, (inD.get(id) ?? 0) + 1);
      if (!deps.has(d)) deps.set(d, []);
      deps.get(d).push(id);
    }
  }
  const q = [];
  for (const [id, deg] of inD) if (deg === 0) q.push(id);
  const sorted = [];
  while (q.length) {
    const id = q.shift();
    sorted.push(id);
    for (const dep of deps.get(id) ?? []) {
      const nd = (inD.get(dep) ?? 1) - 1;
      inD.set(dep, nd);
      if (nd === 0) q.push(dep);
    }
  }
  return sorted;
}

function renderTemplate(content, vars) {
  return content.replace(
    /\{\{(\w+)(?::([^}]*))?\}\}/g,
    (_, k, d) => vars[k] ?? d ?? `{{${k}}}`
  );
}

const resolved = resolveDeps(selected);
const sorted = topoSort(resolved);
const normalIds = sorted.filter((id) => !allNodes.get(id)?.post);
const postIds = sorted.filter((id) => allNodes.get(id)?.post);

const sections = [
  `#!/usr/bin/env bash
set -euo pipefail
log_info()  { echo -e "[INFO]  $*"; }
log_ok()    { echo -e "[OK]    $*"; }
`,
];

for (const id of [...normalIds, ...postIds]) {
  const node = allNodes.get(id);
  if (!node?.script) continue;
  const scriptPath = path.resolve(node.script);
  let content = fs.readFileSync(scriptPath, "utf-8");
  content = renderTemplate(content, { ...config.vars, ...node.vars });
  sections.push(`# ─── ${node.label} (${node.id}) ───\n${content}`);
}

sections.push('\nlog_ok "配置完成!"');
const output = sections.join("\n\n");
fs.writeFileSync(outputPath, output, { mode: 0o755 });
console.log(`Generated: ${outputPath}`);

// 用法: node tests/integration/generate.mjs <output_path> <id1> <id2> ...
// 通过真实 CLI (dot --select) 生成配置脚本，而非重新实现生成器逻辑。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const [outputPath, ...selectedIds] = process.argv.slice(2);

if (!outputPath || selectedIds.length === 0) {
  console.error("用法: node tests/integration/generate.mjs <output_path> <id1> <id2> ...");
  process.exit(1);
}

const projectDir = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../..");
const configPath = path.join(projectDir, "configs/tmux.yaml");
const cliPath = path.join(projectDir, "dist/index.js");

const args = [
  cliPath,
  "--config", configPath,
  "--select", ...selectedIds,
  "--quiet",
  "--dry-run",
];

const script = execFileSync(process.execPath, args, {
  encoding: "utf-8",
  cwd: projectDir,
});

fs.writeFileSync(outputPath, script, { mode: 0o755 });
console.error(`Generated: ${outputPath}`);

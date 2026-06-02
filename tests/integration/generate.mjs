// 用法: node tests/integration/generate.mjs <output_path> <id1> <id2> ...
// 通过真实 CLI 生成 standalone 脚本，再注入非交互执行 preset。
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

function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const args = [
  cliPath,
  "build",
  "--config", configPath,
  "--output", outputPath,
  "--quiet",
];

execFileSync(process.execPath, args, {
  cwd: projectDir,
});

const script = fs.readFileSync(outputPath, "utf-8");
const preset = selectedIds.join(" ");
if (!script.startsWith("#!/usr/bin/env bash\n")) {
  throw new Error("Generated standalone script is missing the expected bash shebang.");
}
const injected = script.replace(
  "#!/usr/bin/env bash\n",
  `#!/usr/bin/env bash\nDOT_RUN_PRESET=${shellQuote(preset)}\n`
);

fs.writeFileSync(outputPath, injected, { mode: 0o755 });
console.error(`Generated: ${outputPath}`);

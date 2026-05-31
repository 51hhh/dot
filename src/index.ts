import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./loader/loader.js";
import { banner, c } from "./utils/colors.js";
import { navigate } from "./menu/navigator.js";
import { flattenNodes, resolveDeps, getLeafIds } from "./utils/deps.js";
import { isLeaf } from "./menu/tree.js";
import { assemble } from "./generator/assembler.js";
import { assembleStandalone } from "./generator/standalone-assembler.js";
import { validateScript } from "./generator/validator.js";

const program = new Command();

program
  .name("dot")
  .description("Interactive system configuration generator")
  .version("1.0.0");


program
  .command("generate", { hidden: true })
  .requiredOption("-c, --config <path>", "Path to config file (YAML/JSON)")
  .option("-o, --output <path>", "Output script path (overrides config)")
  .option("-s, --select <ids...>", "Pre-select menu item ids (skip interactive menu)")
  .option("--dry-run", "Print generated script to stdout without writing")
  .option("--quiet", "Suppress banner and selection output")
  .action(async (opts) => {
    try {
      await run(opts);
    } catch (err: unknown) {
      handleError(err);
    }
  });

program
  .command("build")
  .description("Build a self-contained interactive bash script")
  .requiredOption("-c, --config <path>", "Path to config file (YAML/JSON)")
  .option("-o, --output <path>", "Output script path", "dist/dot.sh")
  .option("--quiet", "Suppress non-error output")
  .action((opts) => {
    try {
      runBuild(opts);
    } catch (err: unknown) {
      handleError(err);
    }
  });

function handleError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  console.error(c.error(`
  Error: ${message}
`));
  process.exit(1);
}

async function run(opts: {
  config: string;
  output?: string;
  dryRun?: boolean;
  select?: string[];
  quiet?: boolean;
}) {
  const config = loadConfig(opts.config);

  if (!opts.quiet) {
    console.log(banner(config.name, config.version, config.description));
  }

  const allNodes = flattenNodes(config.menu);
  let selectedIds: Set<string>;

  if (opts.select) {
    const expanded = new Set<string>();
    for (const id of opts.select) {
      const node = allNodes.get(id);
      if (!node) {
        throw new Error(`Unknown menu item id: "${id}"`);
      }
      if (isLeaf(node)) {
        expanded.add(id);
      } else {
        for (const leafId of getLeafIds(node)) {
          expanded.add(leafId);
        }
      }
    }
    selectedIds = resolveDeps(expanded, allNodes);
  } else {
    const result = await navigate(config);
    if (result.quit) {
      if (!opts.quiet) console.log(c.dim("\n  已退出\n"));
      process.exit(0);
    }
    selectedIds = result.selectedIds;
  }

  if (selectedIds.size === 0) {
    if (!opts.quiet) console.log(c.warn("\n  未选择任何配置项\n"));
    process.exit(0);
  }

  if (!opts.quiet) {
    console.log(`\n  ${c.title("已选配置:")}`);
    for (const id of selectedIds) {
      const node = allNodes.get(id)!;
      if (!node.script) continue;
      console.log(`    ${c.selected(" ✓")} ${node.label}`);
    }
  }

  const warnings: string[] = [];
  const script = assemble({
    config,
    configPath: opts.config,
    selectedIds,
    allNodes,
    warnings,
  });

  const validationError = validateScript(script);
  if (!opts.quiet) {
    if (validationError) {
      console.log(c.warn(`\n  ⚠ 脚本语法警告: ${validationError}`));
    }
    for (const w of warnings) {
      console.log(c.warn(`  ⚠ ${w}`));
    }
  }

  if (opts.dryRun) {
    if (opts.quiet) {
      process.stdout.write(script.endsWith("\n") ? script : script + "\n");
    } else {
      console.log(`\n${c.dim("─".repeat(50))}`);
      console.log(script);
      console.log(c.dim("─".repeat(50)));
    }
    return;
  }

  const resolvedOutput = resolveOutputPath(opts.config, opts.output, config.output?.dir ?? "dist", config.output?.filename ?? "setup.sh");
  writeScript(resolvedOutput, script);

  if (!opts.quiet) {
    console.log(c.success(`
  ✓ 脚本已生成: ${resolvedOutput}`));
    console.log(c.dim(`  运行: bash ${resolvedOutput}
`));
  }
}

function runBuild(opts: {
  config: string;
  output?: string;
  quiet?: boolean;
}) {
  const config = loadConfig(opts.config);
  const allNodes = flattenNodes(config.menu);
  const warnings: string[] = [];
  const script = assembleStandalone({
    config,
    configPath: opts.config,
    allNodes,
    warnings,
  });

  const validationError = validateScript(script);
  if (validationError) {
    throw new Error(`Generated script failed bash syntax validation: ${validationError}`);
  }

  const resolvedOutput = path.resolve(opts.output ?? "dist/dot.sh");
  writeScript(resolvedOutput, script);

  if (!opts.quiet) {
    console.log(c.success(`
  ✓ 自包含脚本已生成: ${resolvedOutput}`));
    for (const w of warnings) {
      console.log(c.warn(`  ⚠ ${w}`));
    }
    console.log(c.dim(`  运行: bash ${resolvedOutput}
`));
  }
}

function resolveOutputPath(
  configPath: string,
  outputPath: string | undefined,
  defaultDir: string,
  defaultFilename: string
): string {
  const configDir = path.dirname(path.resolve(configPath));
  const target = outputPath ?? path.join(defaultDir, defaultFilename);
  return path.isAbsolute(target) ? target : path.resolve(configDir, target);
}

function writeScript(outputPath: string, script: string): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, script, { mode: 0o755 });
}

if (process.argv.length > 2 && process.argv[2] !== "build" && process.argv[2] !== "generate") {
  process.argv.splice(2, 0, "generate");
}

program.parse();

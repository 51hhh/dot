import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./loader/loader.js";
import { banner, c } from "./utils/colors.js";
import { navigate } from "./menu/navigator.js";
import { flattenNodes } from "./utils/deps.js";
import { assemble } from "./generator/assembler.js";
import { validateScript } from "./generator/validator.js";

const program = new Command();

program
  .name("dot")
  .description("Interactive system configuration generator")
  .version("1.0.0")
  .requiredOption("-c, --config <path>", "Path to config file (YAML/JSON)")
  .option("-o, --output <path>", "Output script path (overrides config)")
  .option("--dry-run", "Print generated script to stdout without writing")
  .action(async (opts) => {
    try {
      await run(opts);
    } catch (err: any) {
      console.error(c.error(`\n  Error: ${err.message}\n`));
      process.exit(1);
    }
  });

async function run(opts: { config: string; output?: string; dryRun?: boolean }) {
  // Load config
  const config = loadConfig(opts.config);
  console.log(banner(config.name, config.version, config.description));

  // Run interactive navigator
  const { selectedIds, quit } = await navigate(config);

  if (quit) {
    console.log(c.dim("\n  已退出\n"));
    process.exit(0);
  }

  if (selectedIds.size === 0) {
    console.log(c.warn("\n  未选择任何配置项\n"));
    process.exit(0);
  }

  // Show selected items
  const allNodes = flattenNodes(config.menu);
  console.log(`\n  ${c.title("已选配置:")}`);
  for (const id of selectedIds) {
    const node = allNodes.get(id)!;
    if (!node.script) continue; // skip branch nodes in display
    console.log(`    ${c.selected(" ✓")} ${node.label}`);
  }

  // Assemble script
  const script = assemble({
    config,
    configPath: opts.config,
    selectedIds,
  });

  // Validate
  const validationError = validateScript(script);
  if (validationError) {
    console.log(c.warn(`\n  ⚠ 脚本语法警告: ${validationError}`));
  }

  if (opts.dryRun) {
    console.log(`\n${c.dim("─".repeat(50))}`);
    console.log(script);
    console.log(c.dim("─".repeat(50)));
    return;
  }

  // Write output
  const outputDir = config.output?.dir ?? "dist";
  const outputFilename = config.output?.filename ?? "setup.sh";
  const outputPath = opts.output ?? path.join(outputDir, outputFilename);
  const resolvedOutput = path.resolve(outputPath);

  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, script, { mode: 0o755 });

  console.log(c.success(`\n  ✓ 脚本已生成: ${resolvedOutput}`));
  console.log(c.dim(`  运行: bash ${resolvedOutput}\n`));
}

program.parse();

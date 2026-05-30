import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./loader/loader.js";
import { banner, c } from "./utils/colors.js";
import { navigate } from "./menu/navigator.js";
import { flattenNodes, resolveDeps } from "./utils/deps.js";
import { assemble } from "./generator/assembler.js";
import { validateScript } from "./generator/validator.js";

const program = new Command();

program
  .name("dot")
  .description("Interactive system configuration generator")
  .version("1.0.0")
  .requiredOption("-c, --config <path>", "Path to config file (YAML/JSON)")
  .option("-o, --output <path>", "Output script path (overrides config)")
  .option("-s, --select <ids...>", "Pre-select menu item ids (skip interactive menu)")
  .option("--dry-run", "Print generated script to stdout without writing")
  .option("--quiet", "Suppress banner and selection output")
  .action(async (opts) => {
    try {
      await run(opts);
    } catch (err: any) {
      console.error(c.error(`\n  Error: ${err.message}\n`));
      process.exit(1);
    }
  });

async function run(opts: {
  config: string;
  output?: string;
  dryRun?: boolean;
  select?: string[];
  quiet?: boolean;
}) {
  // Load config
  const config = loadConfig(opts.config);

  if (!opts.quiet) {
    console.log(banner(config.name, config.version, config.description));
  }

  let selectedIds: Set<string>;

  if (opts.select) {
    // Non-interactive mode: use pre-selected ids
    const allNodes = flattenNodes(config.menu);
    for (const id of opts.select) {
      if (!allNodes.has(id)) {
        throw new Error(`Unknown menu item id: "${id}"`);
      }
    }
    selectedIds = resolveDeps(new Set(opts.select), allNodes);
  } else {
    // Interactive mode: run navigator
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

  // Show selected items
  if (!opts.quiet) {
    const allNodes = flattenNodes(config.menu);
    console.log(`\n  ${c.title("已选配置:")}`);
    for (const id of selectedIds) {
      const node = allNodes.get(id)!;
      if (!node.script) continue;
      console.log(`    ${c.selected(" ✓")} ${node.label}`);
    }
  }

  // Assemble script
  const script = assemble({
    config,
    configPath: opts.config,
    selectedIds,
  });

  // Validate
  const validationError = validateScript(script);
  if (validationError && !opts.quiet) {
    console.log(c.warn(`\n  ⚠ 脚本语法警告: ${validationError}`));
  }

  if (opts.dryRun) {
    if (opts.quiet) {
      process.stdout.write(script);
    } else {
      console.log(`\n${c.dim("─".repeat(50))}`);
      console.log(script);
      console.log(c.dim("─".repeat(50)));
    }
    return;
  }

  // Write output
  const outputDir = config.output?.dir ?? "dist";
  const outputFilename = config.output?.filename ?? "setup.sh";
  const outputPath = opts.output ?? path.join(outputDir, outputFilename);
  const resolvedOutput = path.resolve(outputPath);

  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, script, { mode: 0o755 });

  if (!opts.quiet) {
    console.log(c.success(`\n  ✓ 脚本已生成: ${resolvedOutput}`));
    console.log(c.dim(`  运行: bash ${resolvedOutput}\n`));
  }
}

program.parse();

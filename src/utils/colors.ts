import chalk from "chalk";

export const c = {
  title: chalk.bold.cyan,
  menu: chalk.white,
  selected: chalk.green,
  dep: chalk.yellow,
  dim: chalk.dim,
  error: chalk.red,
  warn: chalk.yellow,
  success: chalk.green,
  info: chalk.cyan,
  highlight: chalk.bold.white,
  breadcrumb: chalk.dim.cyan,
};

export function banner(name: string, version: string, description?: string) {
  const lines = [
    ``,
    chalk.cyan(`  ╔══════════════════════════════════════════╗`),
    chalk.cyan(`  ║`) + chalk.bold.white(`  ${name} v${version}`.padEnd(42)) + chalk.cyan(`║`),
  ];
  if (description) {
    lines.push(
      chalk.cyan(`  ║`) + chalk.dim(`  ${description}`.padEnd(42)) + chalk.cyan(`║`)
    );
  }
  lines.push(
    chalk.cyan(`  ╚══════════════════════════════════════════╝`),
    ``
  );
  return lines.join("\n");
}

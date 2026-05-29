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

function visibleWidth(str: string): number {
  // Strip ANSI escape codes, then count CJK as 2 width
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, "");
  let width = 0;
  for (const ch of stripped) {
    const code = ch.codePointAt(0)!;
    // CJK Unified Ideographs + common CJK ranges
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3000 && code <= 0x30ff) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

function padVisible(str: string, targetWidth: number): string {
  const current = visibleWidth(str);
  const padding = Math.max(0, targetWidth - current);
  return str + " ".repeat(padding);
}

const BOX_WIDTH = 42;

export function banner(name: string, version: string, description?: string) {
  const titleText = chalk.bold.white(`  ${name} v${version}`);
  const descText = description ? chalk.dim(`  ${description}`) : null;

  const lines = [
    ``,
    chalk.cyan(`  ╔${"═".repeat(BOX_WIDTH)}╗`),
    chalk.cyan(`  ║`) + padVisible(titleText, BOX_WIDTH) + chalk.cyan(`║`),
  ];
  if (descText) {
    lines.push(chalk.cyan(`  ║`) + padVisible(descText, BOX_WIDTH) + chalk.cyan(`║`));
  }
  lines.push(chalk.cyan(`  ╚${"═".repeat(BOX_WIDTH)}╝`), ``);
  return lines.join("\n");
}

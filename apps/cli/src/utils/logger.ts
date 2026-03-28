import chalk from "chalk";
import { PALETTE, ICONS } from "./theme.js";

export const logger = {
  error: (...args: unknown[]) =>
    console.error(
      `${chalk.hex(PALETTE.red).bold(`${ICONS.fail} error`)} ${chalk.hex(PALETTE.redDim)}`,
      ...args,
    ),
  warn: (...args: unknown[]) =>
    console.warn(
      `${chalk.hex(PALETTE.yellow).bold(`${ICONS.warn} warn`)} ${chalk.hex(PALETTE.yellowDim)}`,
      ...args,
    ),
  info: (...args: unknown[]) =>
    console.log(
      `${chalk.hex(PALETTE.cyan).bold(`${ICONS.info} info`)} ${chalk.hex(PALETTE.text)}`,
      ...args,
    ),
  success: (...args: unknown[]) =>
    console.log(
      `${chalk.hex(PALETTE.green).bold(`${ICONS.pass} success`)} ${chalk.hex(PALETTE.greenDim)}`,
      ...args,
    ),
  dim: (...args: unknown[]) => console.log(chalk.hex(PALETTE.muted)(args.map(String).join(" "))),
  log: (...args: unknown[]) => console.log(...args),
  break: () => console.log(""),
  header: (text: string) => console.log(`\n${chalk.hex(PALETTE.brand).bold(text)}\n`),
  step: (text: string) =>
    console.log(`  ${chalk.hex(PALETTE.cyan)(ICONS.rightArrow)} ${chalk.hex(PALETTE.text)(text)}`),
  bullet: (text: string) =>
    console.log(`  ${chalk.hex(PALETTE.orange)(ICONS.bullet)} ${chalk.hex(PALETTE.textDim)(text)}`),
  divider: () => console.log(chalk.hex(PALETTE.subtle)(`${ICONS.boxH}`.repeat(60))),
  separator: () => console.log(""),
};

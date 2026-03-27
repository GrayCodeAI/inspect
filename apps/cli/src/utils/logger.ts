import chalk from "chalk";

export const logger = {
  error: (...args: unknown[]) => console.error(chalk.red("error"), ...args),
  warn: (...args: unknown[]) => console.warn(chalk.yellow("warn"), ...args),
  info: (...args: unknown[]) => console.log(chalk.cyan("info"), ...args),
  success: (...args: unknown[]) => console.log(chalk.green("success"), ...args),
  dim: (...args: unknown[]) => console.log(chalk.dim(...args.map(String))),
  log: (...args: unknown[]) => console.log(...args),
  break: () => console.log(""),
};

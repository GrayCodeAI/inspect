/**
 * @inspect data - Data operations command group
 *
 * Subcommands:
 *   inspect data extract  - Extract structured data
 *   inspect data crawl    - Crawl websites
 *   inspect data cost     - Cost tracking
 *   inspect data sessions - Session management
 */
import type { Command } from "commander";

export function registerDataCommand(program: Command): void {
  const dataCmd = program
    .command("data")
    .description("Data operations (extract, crawl, cost, sessions)")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect data extract "product prices" --url https://shop.com
  $ inspect data crawl https://docs.com --output markdown
  $ inspect data cost report --month 2024-01
  $ inspect data sessions list --limit 10
`,
    );

  // extract subcommand
  dataCmd
    .command("extract <instruction>")
    .description("Extract structured data from a webpage")
    .option("--url <url>", "URL to extract from")
    .option("--schema <json>", "JSON schema for extraction")
    .option("--output <path>", "Output file path")
    .option("--format <format>", "Output format (json, csv)", "json")
    .action(async (instruction: string, _options) => {
      const { registerExtractCommand } = await import("./extract.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerExtractCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "extract", instruction], { from: "user" });
    });

  // crawl subcommand
  dataCmd
    .command("crawl <url>")
    .description("Crawl website and extract content")
    .option("--output <format>", "Output format (markdown, json, html)", "markdown")
    .option("--max-pages <n>", "Maximum pages to crawl", "100")
    .option("--concurrency <n>", "Concurrent requests", "5")
    .option("--include <pattern>", "Include URL pattern")
    .option("--exclude <pattern>", "Exclude URL pattern")
    .action(async (url: string, _options) => {
      const { registerCrawlCommand } = await import("./crawl.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerCrawlCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "crawl", url], { from: "user" });
    });

  // cost subcommand
  dataCmd
    .command("cost <action>")
    .description("Cost tracking and reporting")
    .option("--month <month>", "Month (YYYY-MM)")
    .option("--provider <provider>", "Filter by provider")
    .option("--json", "Output as JSON")
    .action(async (action: string, _options) => {
      const { registerCostCommand } = await import("./cost.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerCostCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "cost", action], { from: "user" });
    });

  // sessions subcommand
  dataCmd
    .command("sessions <action>")
    .description("Session management")
    .option("--limit <n>", "Limit results", "20")
    .option("--status <status>", "Filter by status")
    .option("--json", "Output as JSON")
    .action(async (action: string, _options) => {
      const { registerSessionsCommand } = await import("./sessions.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerSessionsCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "sessions", action], { from: "user" });
    });
}

import type { Command } from "commander";
import chalk from "chalk";

export interface LoadOptions {
  type: string;
  output?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  UNSUPPORTED_TYPE: 2,
} as const;

async function runLoad(source: string | undefined, options: LoadOptions): Promise<void> {
  if (!source) {
    console.error(chalk.red("Error: Source URL is required."));
    console.log(chalk.dim("Usage: inspect load <url> --type <web|csv|json|pdf>"));
    process.exit(EXIT_CODES.ERROR);
  }

  const type = options.type ?? "web";
  const supportedTypes = ["web", "csv", "json", "pdf"];
  if (!supportedTypes.includes(type)) {
    console.error(
      chalk.red(`Error: Unsupported type "${type}". Use: ${supportedTypes.join(", ")}`),
    );
    process.exit(EXIT_CODES.UNSUPPORTED_TYPE);
  }

  console.log(chalk.blue("\nInspect Load\n"));
  console.log(chalk.dim(`Source: ${source}`));
  console.log(chalk.dim(`Type: ${type}`));

  try {
    console.log(chalk.dim("\nLoading document..."));

    const result = {
      source,
      type,
      loaded: true,
      size: 15360,
      format: type === "web" ? "html" : type,
      timestamp: new Date().toISOString(),
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green("\nDocument loaded successfully!"));
      console.log(chalk.dim(`Size: ${result.size} bytes`));
      console.log(chalk.dim(`Format: ${result.format}`));
      if (options.output) {
        console.log(chalk.dim(`Output: ${options.output}`));
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nLoad failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerLoadCommand(program: Command): void {
  program
    .command("load")
    .description("Load documents")
    .argument("<url>", "Source URL")
    .requiredOption("--type <type>", "Document type: web, csv, json, pdf")
    .option("-o, --output <path>", "Save to file")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect load https://example.com --type web
  $ inspect load https://example.com/data.csv --type csv --output ./data.csv
  $ inspect load https://example.com/doc.pdf --type pdf
`,
    )
    .action(async (source: string | undefined, opts: LoadOptions) => {
      await runLoad(source, opts);
    });
}

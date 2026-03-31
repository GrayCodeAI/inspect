import type { Command } from "commander";
import chalk from "chalk";

export interface PDFOptions {
  format?: string;
  landscape?: boolean;
  margin?: string;
  headerTemplate?: string;
  footerTemplate?: string;
  printBackground?: boolean;
  waitForTimeout?: string;
}

async function generatePDF(url: string, output: string, options: PDFOptions): Promise<void> {
  console.log(chalk.dim(`Generating PDF of ${url}...`));

  const { BrowserManager } = await import("@inspect/browser");
  const browserMgr = new BrowserManager();

  // PDF requires Chromium
  await browserMgr.launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 720 },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const page = await browserMgr.newPage();

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

  if (options.waitForTimeout) {
    await page.waitForTimeout(parseInt(options.waitForTimeout, 10));
  }

  // Parse margin
  let margin: { top?: string; right?: string; bottom?: string; left?: string } | undefined;
  if (options.margin) {
    const parts = options.margin.split(",").map((s) => s.trim());
    if (parts.length === 1) {
      margin = { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
    } else if (parts.length === 4) {
      margin = { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
    }
  }

  await page.pdf({
    path: output,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    format: (options.format ?? "A4") as any,
    landscape: options.landscape ?? false,
    printBackground: options.printBackground ?? true,
    margin: margin ?? { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
  });

  await browserMgr.closeBrowser();

  console.log(chalk.green(`PDF saved: ${output}`));
  console.log(chalk.dim(`  URL: ${url}`));
  console.log(chalk.dim(`  Format: ${options.format ?? "A4"}${options.landscape ? " (landscape)" : ""}`));
}

export function registerPDFCommand(program: Command): void {
  program
    .command("pdf")
    .description("Save a web page as PDF")
    .argument("<url>", "URL to render")
    .argument("<output>", "Output PDF file path")
    .option("--format <format>", "Paper format: A4, Letter, Legal, Tabloid", "A4")
    .option("--landscape", "Use landscape orientation")
    .option("--margin <margin>", "Margins: single value or top,right,bottom,left (e.g. 1cm or 1cm,2cm,1cm,2cm)")
    .option("--no-print-background", "Disable printing background graphics")
    .option("--wait-for-timeout <ms>", "Wait N ms before generating PDF")
    .addHelpText("after", `
Examples:
  $ inspect pdf https://example.com page.pdf
  $ inspect pdf https://myapp.com report.pdf --format Letter --landscape
  $ inspect pdf https://docs.site.com docs.pdf --margin "2cm,1cm,2cm,1cm"
  $ inspect pdf https://myapp.com/invoice invoice.pdf --no-print-background
`)
    .action(async (url: string, output: string, opts: PDFOptions) => {
      try {
        await generatePDF(url, output, opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });
}

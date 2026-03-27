import type { Command } from "commander";
import chalk from "chalk";

export interface CrawlOptions {
  depth?: string;
  maxPages?: string;
  concurrency?: string;
  output?: string;
  format?: string;
  extractContent?: boolean;
  delay?: string;
  exclude?: string[];
  include?: string[];
  sameDomain?: boolean;
}

async function runCrawl(url: string | undefined, options: CrawlOptions): Promise<void> {
  if (!url) {
    console.error(chalk.red("Error: URL is required for crawling."));
    console.log(chalk.dim("Usage: inspect crawl <url> --depth 3 --max-pages 100"));
    process.exit(1);
  }

  console.log(chalk.blue("\nInspect Crawl\n"));
  console.log(chalk.dim(`URL: ${url}`));
  console.log(chalk.dim(`Depth: ${options.depth ?? "3"}`));
  console.log(chalk.dim(`Max Pages: ${options.maxPages ?? "100"}`));
  console.log(chalk.dim(`Concurrency: ${options.concurrency ?? "5"}`));

  try {
    const { WebCrawler } = await import("@inspect/data");

    const crawler = new WebCrawler(
      {
        startUrl: url,
        maxDepth: parseInt(options.depth ?? "3", 10),
        maxPages: parseInt(options.maxPages ?? "100", 10),
        concurrency: parseInt(options.concurrency ?? "5", 10),
        extractContent: options.extractContent ?? false,
        delay: parseInt(options.delay ?? "0", 10),
        excludePatterns: options.exclude ?? [],
        includePatterns: options.include ?? [],
        sameDomain: options.sameDomain !== false,
      },
      (event) => {
        if (event.type === "page_crawled") {
          process.stdout.write(
            chalk.dim(`\r  Crawled: ${event.pagesCrawled} pages (${event.progress}%)`),
          );
        }
      },
    );

    console.log(chalk.dim("\nStarting crawl..."));
    const job = await crawler.crawl();

    console.log(chalk.green(`\n\nCrawl completed!`));
    console.log(chalk.dim(`  Pages crawled: ${job.pagesCrawled}`));
    console.log(chalk.dim(`  Errors: ${job.errorCount}`));
    console.log(chalk.dim(`  Duration: ${(job.endTime ?? 0) - (job.startTime ?? 0)}ms`));

    const format = (options.format ?? "json") as "json" | "csv" | "jsonl";
    const output = crawler.export(format);

    if (options.output) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(options.output, output, "utf-8");
      console.log(chalk.green(`\nResults saved to: ${options.output}`));
    } else {
      console.log(chalk.dim("\nResults (first 2000 chars):"));
      console.log(output.slice(0, 2000));
    }
  } catch (error) {
    console.error(
      chalk.red(`\nCrawl failed: ${error instanceof Error ? error.message : String(error)}`),
    );
    process.exit(1);
  }
}

export function registerCrawlCommand(program: Command): void {
  program
    .command("crawl")
    .description("Crawl a website and extract content")
    .argument("[url]", "URL to crawl")
    .option("--depth <n>", "Maximum crawl depth (default: 3)")
    .option("--max-pages <n>", "Maximum pages to crawl (default: 100)")
    .option("--concurrency <n>", "Concurrent requests (default: 5)")
    .option("--delay <ms>", "Delay between requests in ms")
    .option("--extract-content", "Extract text content from pages")
    .option("--no-same-domain", "Allow crawling external domains")
    .option("--include <patterns...>", "URL patterns to include")
    .option("--exclude <patterns...>", "URL patterns to exclude")
    .option("-o, --output <path>", "Output file path")
    .option("--format <fmt>", "Output format: json, csv, jsonl (default: json)")
    .action(runCrawl);
}

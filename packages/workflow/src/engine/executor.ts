// ============================================================================
// @inspect/workflow - Workflow Executor
// ============================================================================

import { generateId } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("workflow/executor");
import type {
  WorkflowDefinition,
  WorkflowBlock,
  WorkflowBlockResult,
  WorkflowRun,
  WorkflowRunStatus,
} from "@inspect/shared";
import { WorkflowContext } from "./context.js";

/** Event emitter callback for workflow events */
export type WorkflowEventHandler = (
  event: string,
  data: Record<string, unknown>,
) => void;

/**
 * WorkflowExecutor orchestrates the execution of workflow definitions.
 * It processes blocks sequentially, passes context between them,
 * handles errors with continueOnError support, and tracks run state.
 */
export class WorkflowExecutor {
  private eventHandler?: WorkflowEventHandler;
  private blockHandlers: Map<
    string,
    (block: WorkflowBlock, context: WorkflowContext) => Promise<unknown>
  > = new Map();
  private cancelledRuns: Set<string> = new Set();
  private pausedRuns: Map<string, {
    resolve: (value: unknown) => void;
    context: WorkflowContext;
  }> = new Map();

  constructor(eventHandler?: WorkflowEventHandler) {
    this.eventHandler = eventHandler;
  }

  /**
   * Register a handler for a specific block type.
   */
  registerBlockHandler(
    type: string,
    handler: (block: WorkflowBlock, context: WorkflowContext) => Promise<unknown>,
  ): void {
    this.blockHandlers.set(type, handler);
  }

  /**
   * Execute a complete workflow definition.
   */
  async execute(
    definition: WorkflowDefinition,
    inputParams?: Record<string, unknown>,
  ): Promise<WorkflowRun> {
    const runId = generateId();
    const context = new WorkflowContext(
      inputParams,
      definition.parameters,
      definition.strictMode,
    );

    const run: WorkflowRun = {
      id: runId,
      workflowId: definition.id,
      status: "running",
      parameters: inputParams ?? {},
      blockResults: {},
      startedAt: Date.now(),
    };

    this.emit("workflow:started", { runId, workflowId: definition.id });

    try {
      // Build a block map for quick lookup
      const blockMap = new Map<string, WorkflowBlock>();
      for (const block of definition.blocks) {
        blockMap.set(block.id, block);
      }

      // Execute blocks in order, following nextBlockId chain
      let currentBlock: WorkflowBlock | undefined = definition.blocks[0];

      while (currentBlock) {
        if (this.cancelledRuns.has(runId)) {
          run.status = "cancelled";
          this.emit("workflow:cancelled", { runId });
          break;
        }

        run.currentBlockId = currentBlock.id;
        const blockResult = await this.executeBlock(currentBlock, context, run);
        run.blockResults[currentBlock.id] = blockResult;

        // Re-check cancellation after block execution in case
        // cancellation was requested while the block was running
        if (this.cancelledRuns.has(runId)) {
          run.status = "cancelled";
          this.emit("workflow:cancelled", { runId });
          break;
        }

        // Store block output in context for downstream blocks
        if (blockResult.output !== undefined) {
          context.set(`block_${currentBlock.id}`, blockResult.output);
          context.set("lastOutput", blockResult.output);
        }

        // Determine next block
        if (blockResult.status === "failed" && currentBlock.errorBlockId) {
          currentBlock = blockMap.get(currentBlock.errorBlockId);
        } else if (currentBlock.nextBlockId) {
          currentBlock = blockMap.get(currentBlock.nextBlockId);
        } else {
          // Find next block by index in definition array
          const currentIndex = definition.blocks.findIndex(
            (b) => b.id === currentBlock!.id,
          );
          currentBlock = definition.blocks[currentIndex + 1];
        }
      }

      // Determine final run status
      if (run.status !== "cancelled" && run.status !== "paused_for_input") {
        const hasFailures = Object.values(run.blockResults).some(
          (r) => r.status === "failed",
        );
        run.status = hasFailures ? "failed" : "completed";
      }
    } catch (error) {
      run.status = "failed";
      run.error =
        error instanceof Error ? error.message : String(error);
      this.emit("workflow:error", { runId, error: run.error });
    }

    run.completedAt = Date.now();
    run.duration = run.completedAt - run.startedAt;
    run.output = context.toObject();

    this.emit("workflow:completed", {
      runId,
      status: run.status,
      duration: run.duration,
    });
    this.cancelledRuns.delete(runId);

    return run;
  }

  /**
   * Execute a single workflow block with retry support.
   */
  async executeBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
    run: WorkflowRun,
  ): Promise<WorkflowBlockResult> {
    const result: WorkflowBlockResult = {
      blockId: block.id,
      status: "running",
      retryCount: 0,
    };

    this.emit("block:started", {
      blockId: block.id,
      type: block.type,
      label: block.label,
    });

    const maxRetries = block.maxRetries ?? 0;
    const startTime = Date.now();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        result.retryCount = attempt;
        const output = await this.executeBlockByType(block, context, run);
        result.output = output;
        result.status = "completed";
        result.duration = Date.now() - startTime;

        this.emit("block:completed", {
          blockId: block.id,
          duration: result.duration,
        });
        return result;
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : String(error);

        if (attempt < maxRetries) {
          this.emit("block:retry", {
            blockId: block.id,
            attempt: attempt + 1,
            error: errorMsg,
          });
          // Exponential backoff
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }

        result.status = "failed";
        result.error = errorMsg;
        result.duration = Date.now() - startTime;

        this.emit("block:failed", {
          blockId: block.id,
          error: errorMsg,
        });

        if (!block.continueOnFailure) {
          throw new Error(
            `Block '${block.label}' (${block.id}) failed: ${errorMsg}`,
          );
        }
      }
    }

    return result;
  }

  /**
   * Cancel a running workflow.
   */
  cancel(runId: string): void {
    this.cancelledRuns.add(runId);
  }

  /**
   * Resume a paused workflow (e.g., after human interaction).
   */
  resume(runId: string, data?: unknown): void {
    const paused = this.pausedRuns.get(runId);
    if (paused) {
      paused.resolve(data);
      this.pausedRuns.delete(runId);
    }
  }

  /**
   * Pause a run for human interaction, returning a promise that resolves
   * when resume() is called.
   */
  async waitForResume(runId: string, context: WorkflowContext): Promise<unknown> {
    return new Promise((resolve) => {
      this.pausedRuns.set(runId, { resolve, context });
    });
  }

  /**
   * Route block execution to the appropriate handler based on type.
   */
  private async executeBlockByType(
    block: WorkflowBlock,
    context: WorkflowContext,
    run: WorkflowRun,
  ): Promise<unknown> {
    // Check for registered custom handlers first
    const customHandler = this.blockHandlers.get(block.type);
    if (customHandler) {
      return customHandler(block, context);
    }

    // Built-in block type dispatch
    const timeout = block.timeout ?? 120_000;

    const executeWithTimeout = async (
      fn: () => Promise<unknown>,
    ): Promise<unknown> => {
      return Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Block timed out after ${timeout}ms`)),
            timeout,
          ),
        ),
      ]);
    };

    switch (block.type) {
      case "task":
        return executeWithTimeout(() => this.executeTaskBlock(block, context));

      case "for_loop":
        return this.executeForLoopBlock(block, context, run);

      case "code":
        return executeWithTimeout(() => this.executeCodeBlock(block, context));

      case "data_extraction":
        return executeWithTimeout(() =>
          this.executeDataExtractionBlock(block, context),
        );

      case "validation":
        return executeWithTimeout(() =>
          this.executeValidationBlock(block, context),
        );

      case "http_request":
        return executeWithTimeout(() =>
          this.executeHTTPRequestBlock(block, context),
        );

      case "send_email":
        return executeWithTimeout(() =>
          this.executeSendEmailBlock(block, context),
        );

      case "file_parser":
        return executeWithTimeout(() =>
          this.executeFileParserBlock(block, context),
        );

      case "wait":
        return this.executeWaitBlock(block, context);

      case "human_interaction":
        return this.executeHumanInteractionBlock(block, context, run);

      case "conditional":
        return this.executeConditionalBlock(block, context);

      case "text_prompt":
        return executeWithTimeout(() =>
          this.executeTextPromptBlock(block, context),
        );

      case "file_download":
        return executeWithTimeout(() =>
          this.executeFileDownloadBlock(block, context),
        );

      case "file_upload":
        return executeWithTimeout(() =>
          this.executeFileUploadBlock(block, context),
        );

      case "pdf_parser":
        return executeWithTimeout(() =>
          this.executePDFParserBlock(block, context),
        );

      default:
        throw new Error(`Unknown block type: ${block.type}`);
    }
  }

  /**
   * Execute a task block (browser automation with NL prompt).
   */
  private async executeTaskBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<unknown> {
    const params = block.parameters;
    const prompt = context.render(String(params.prompt ?? ""));
    const url = params.url ? context.render(String(params.url)) : undefined;
    const maxSteps = (params.maxSteps as number) ?? 25;

    this.emit("task:execute", { prompt, url, maxSteps });

    // Delegate to registered task handler or return metadata
    const handler = this.blockHandlers.get("task");
    if (handler) {
      return handler(block, context);
    }

    return {
      type: "task",
      prompt,
      url,
      maxSteps,
      status: "delegated",
      message:
        "Task block execution requires a registered task handler (browser agent integration)",
    };
  }

  /**
   * Execute a for-loop block over an array.
   */
  private async executeForLoopBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
    run: WorkflowRun,
  ): Promise<unknown[]> {
    const params = block.parameters;
    const itemsKey = String(params.items ?? "items");
    const items = context.get<unknown[]>(itemsKey);

    if (!Array.isArray(items)) {
      throw new Error(
        `For-loop variable '${itemsKey}' is not an array or is not defined`,
      );
    }

    const innerBlocks = (params.blocks as WorkflowBlock[]) ?? [];
    const results: unknown[] = [];

    for (let i = 0; i < items.length; i++) {
      if (this.cancelledRuns.has(run.id)) break;

      const childContext = context.createChild({
        loopIndex: i,
        loopItem: items[i],
        loopLength: items.length,
      });

      this.emit("loop:iteration", {
        blockId: block.id,
        index: i,
        total: items.length,
      });

      let iterationResult: unknown;
      for (const innerBlock of innerBlocks) {
        const blockResult = await this.executeBlock(innerBlock, childContext, run);
        iterationResult = blockResult.output;
        if (blockResult.output !== undefined) {
          childContext.set("lastOutput", blockResult.output);
        }
      }
      results.push(iterationResult);
    }

    return results;
  }

  /**
   * Execute a code block using Node.js vm module.
   */
  private async executeCodeBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<unknown> {
    const { createContext, runInNewContext } = await import("node:vm");
    const params = block.parameters;
    const code = context.render(String(params.code ?? ""));
    const codeTimeout = (params.timeout as number) ?? 10_000;

    // Build sandbox with restricted globals
    const sandbox: Record<string, unknown> = {
      console: {
        log: (...args: unknown[]) =>
          this.emit("code:log", { args }),
        warn: (...args: unknown[]) =>
          this.emit("code:warn", { args }),
        error: (...args: unknown[]) =>
          this.emit("code:error", { args }),
      },
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      Promise,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
      // Expose context data
      params: context.toObject(),
      context: context.toObject(),
      result: undefined as unknown,
    };

    createContext(sandbox);

    // Wrap code to capture result
    const wrappedCode = `
      (async () => {
        ${code}
      })().then(r => { result = r; }).catch(e => { throw e; })
    `;

    try {
      await runInNewContext(wrappedCode, sandbox, {
        timeout: codeTimeout,
        filename: `workflow-code-${block.id}.js`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Code execution failed: ${msg}`);
    }

    return sandbox.result;
  }

  /**
   * Execute a data extraction block.
   */
  private async executeDataExtractionBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<unknown> {
    const params = block.parameters;
    const instruction = context.render(String(params.instruction ?? ""));
    const schema = params.schema as Record<string, unknown> | undefined;
    const source = context.get("lastOutput");

    this.emit("extraction:execute", { instruction, schema });

    const handler = this.blockHandlers.get("data_extraction");
    if (handler) {
      return handler(block, context);
    }

    // Basic extraction: if source is string, try JSON parse, else pass through
    if (typeof source === "string") {
      try {
        const parsed = JSON.parse(source);
        if (schema) {
          return this.validateAgainstSchema(parsed, schema);
        }
        return parsed;
      } catch (error) {
        logger.debug("Failed to parse source as JSON in extraction", { error });
        return { raw: source, instruction };
      }
    }

    return { source, instruction, schema };
  }

  /**
   * Execute a validation block.
   */
  private async executeValidationBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<boolean> {
    const params = block.parameters;
    const condition = context.render(String(params.condition ?? ""));
    const expected = params.expected;
    const actual = context.get(String(params.variable ?? "lastOutput"));

    this.emit("validation:execute", { condition, expected, actual });

    const handler = this.blockHandlers.get("validation");
    if (handler) {
      const result = await handler(block, context);
      return Boolean(result);
    }

    // Built-in validation logic
    if (expected !== undefined) {
      const isEqual = JSON.stringify(actual) === JSON.stringify(expected);
      if (!isEqual) {
        throw new Error(
          `Validation failed: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
        );
      }
      return true;
    }

    // Evaluate condition string
    if (condition) {
      const { runInNewContext } = await import("node:vm");
      const sandbox = { ...context.toObject(), result: false };
      try {
        sandbox.result = runInNewContext(`Boolean(${condition})`, sandbox, {
          timeout: 5_000,
        });
      } catch (error) {
        logger.debug("Validation condition evaluation error", { condition, error });
        throw new Error(`Validation condition evaluation failed: ${condition}`);
      }
      if (!sandbox.result) {
        throw new Error(`Validation condition not met: ${condition}`);
      }
      return true;
    }

    return Boolean(actual);
  }

  /**
   * Execute an HTTP request block.
   */
  private async executeHTTPRequestBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<unknown> {
    const params = block.parameters;
    const method = String(params.method ?? "GET").toUpperCase();
    const url = context.render(String(params.url ?? ""));
    const headers = params.headers as Record<string, string> | undefined;
    const body = params.body
      ? context.render(
          typeof params.body === "string"
            ? params.body
            : JSON.stringify(params.body),
        )
      : undefined;

    this.emit("http:request", { method, url });

    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";
    const httpModule = isHttps
      ? await import("node:https")
      : await import("node:http");

    return new Promise((resolve, reject) => {
      const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...headers,
      };

      // Render header values through context
      for (const [key, val] of Object.entries(reqHeaders)) {
        reqHeaders[key] = context.render(val);
      }

      const req = httpModule.request(
        url,
        {
          method,
          headers: reqHeaders,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const rawBody = Buffer.concat(chunks).toString("utf-8");
            const statusCode = res.statusCode ?? 0;

            let parsedBody: unknown = rawBody;
            const contentType = res.headers["content-type"] ?? "";
            if (contentType.includes("application/json")) {
              try {
                parsedBody = JSON.parse(rawBody);
              } catch (error) {
                logger.debug("Failed to parse HTTP response as JSON", { error });
              }
            }

            const result = {
              statusCode,
              headers: res.headers,
              body: parsedBody,
              ok: statusCode >= 200 && statusCode < 300,
            };

            if (!result.ok) {
              this.emit("http:error", { statusCode, url });
            }

            resolve(result);
          });
        },
      );

      req.on("error", (err) => reject(new Error(`HTTP request failed: ${err.message}`)));

      if (body && method !== "GET" && method !== "HEAD") {
        req.write(body);
      }
      req.end();
    });
  }

  /**
   * Execute a send email block using raw SMTP over net.
   */
  private async executeSendEmailBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<unknown> {
    const params = block.parameters;
    const to = context.render(String(params.to ?? ""));
    const from = context.render(String(params.from ?? "noreply@inspect.dev"));
    const subject = context.render(String(params.subject ?? ""));
    let body = context.render(String(params.body ?? ""));
    const smtpHost = context.render(String(params.smtpHost ?? "localhost"));
    const smtpPort = (params.smtpPort as number) ?? 25;

    // Template support: replace {{var}} in body
    const template = params.template as string | undefined;
    if (template) {
      body = context.render(template);
    }

    this.emit("email:send", { to, from, subject });

    const handler = this.blockHandlers.get("send_email");
    if (handler) {
      return handler(block, context);
    }

    // Raw SMTP implementation using net module
    const net = await import("node:net");

    return new Promise((resolve, reject) => {
      const socket = net.createConnection(smtpPort, smtpHost);
      const commands: string[] = [];
      let step = 0;

      const smtpCommands = [
        `EHLO inspect.dev\r\n`,
        `MAIL FROM:<${from}>\r\n`,
        `RCPT TO:<${to}>\r\n`,
        `DATA\r\n`,
        `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/html; charset=utf-8\r\nMIME-Version: 1.0\r\n\r\n${body}\r\n.\r\n`,
        `QUIT\r\n`,
      ];

      socket.setEncoding("utf-8");
      socket.setTimeout(30_000);

      socket.on("data", (data: string) => {
        commands.push(data);
        const code = parseInt(data.substring(0, 3), 10);

        if (code >= 400) {
          socket.destroy();
          reject(new Error(`SMTP error: ${data.trim()}`));
          return;
        }

        if (step < smtpCommands.length) {
          socket.write(smtpCommands[step]);
          step++;
        }
      });

      socket.on("end", () => {
        resolve({
          sent: true,
          to,
          from,
          subject,
          smtpLog: commands,
        });
      });

      socket.on("error", (err: Error) => {
        reject(new Error(`SMTP connection failed: ${err.message}`));
      });

      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error("SMTP connection timed out"));
      });
    });
  }

  /**
   * Execute a file parser block.
   */
  private async executeFileParserBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<unknown> {
    const params = block.parameters;
    const filePath = context.render(String(params.path ?? ""));
    const format = String(params.format ?? "auto").toLowerCase();

    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const buffer = await fs.readFile(filePath);
    const ext = format === "auto" ? path.extname(filePath).toLowerCase() : `.${format}`;

    switch (ext) {
      case ".csv": {
        const text = buffer.toString("utf-8");
        const delimiter = String(params.delimiter ?? ",");
        return this.parseCSV(text, delimiter);
      }
      case ".json": {
        const text = buffer.toString("utf-8");
        try {
          return JSON.parse(text);
        } catch (error) {
          logger.debug("JSON parse failed, trying comment stripping", { error });
          const cleaned = text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
          return JSON.parse(cleaned);
        }
      }
      case ".txt":
      case ".text":
        return { text: buffer.toString("utf-8") };
      default:
        return { raw: buffer.toString("base64"), format: ext };
    }
  }

  /**
   * Execute a wait block.
   */
  private async executeWaitBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<unknown> {
    const params = block.parameters;
    const duration = (params.duration as number) ?? 1000;
    const condition = params.condition
      ? context.render(String(params.condition))
      : undefined;

    this.emit("wait:start", { duration, condition });

    if (condition) {
      // Poll condition
      const pollInterval = (params.pollInterval as number) ?? 1000;
      const maxWait = (params.maxWait as number) ?? 60_000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        const { runInNewContext } = await import("node:vm");
        const sandbox = { ...context.toObject(), result: false };
        try {
          sandbox.result = runInNewContext(`Boolean(${condition})`, sandbox, {
            timeout: 5_000,
          });
          if (sandbox.result) {
            return { waited: Date.now() - start, conditionMet: true };
          }
        } catch (error) {
          logger.debug("Wait condition evaluation not met yet", { condition, error });
        }
        await new Promise((r) => setTimeout(r, pollInterval));
      }

      return { waited: maxWait, conditionMet: false };
    }

    await new Promise((r) => setTimeout(r, duration));
    return { waited: duration };
  }

  /**
   * Execute a human interaction block (pauses workflow).
   */
  private async executeHumanInteractionBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
    run: WorkflowRun,
  ): Promise<unknown> {
    const params = block.parameters;
    const prompt = context.render(String(params.prompt ?? "Human input required"));
    const inputFields = params.fields as string[] | undefined;

    this.emit("human:required", {
      runId: run.id,
      blockId: block.id,
      prompt,
      fields: inputFields,
    });

    run.status = "paused_for_input" as WorkflowRunStatus;

    // Wait for resume signal
    const response = await this.waitForResume(run.id, context);

    run.status = "running" as WorkflowRunStatus;

    // Store human response in context
    if (response && typeof response === "object") {
      context.merge(response as Record<string, unknown>);
    }

    return { humanResponse: response };
  }

  /**
   * Execute a conditional block.
   */
  private async executeConditionalBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<unknown> {
    const params = block.parameters;
    const condition = context.render(String(params.condition ?? "false"));

    const { runInNewContext } = await import("node:vm");
    const sandbox = { ...context.toObject(), result: false };
    sandbox.result = runInNewContext(`Boolean(${condition})`, sandbox, {
      timeout: 5_000,
    });

    return {
      condition,
      result: sandbox.result,
      branch: sandbox.result ? "true" : "false",
    };
  }

  /**
   * Execute a text prompt block (sends to LLM).
   */
  private async executeTextPromptBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<unknown> {
    const params = block.parameters;
    const prompt = context.render(String(params.prompt ?? ""));
    const systemPrompt = params.systemPrompt
      ? context.render(String(params.systemPrompt))
      : undefined;

    this.emit("textprompt:execute", { prompt, systemPrompt });

    const handler = this.blockHandlers.get("text_prompt");
    if (handler) {
      return handler(block, context);
    }

    return {
      type: "text_prompt",
      prompt,
      systemPrompt,
      status: "delegated",
      message: "Text prompt execution requires a registered LLM handler",
    };
  }

  /**
   * Execute a file download block.
   */
  private async executeFileDownloadBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<unknown> {
    const params = block.parameters;
    const url = context.render(String(params.url ?? ""));
    const savePath = context.render(String(params.savePath ?? ""));

    const handler = this.blockHandlers.get("file_download");
    if (handler) {
      return handler(block, context);
    }

    this.emit("download:execute", { url, savePath });
    return { type: "file_download", url, savePath, status: "delegated" };
  }

  /**
   * Execute a file upload block.
   */
  private async executeFileUploadBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<unknown> {
    const params = block.parameters;
    const filePath = context.render(String(params.filePath ?? ""));
    const selector = context.render(String(params.selector ?? ""));

    const handler = this.blockHandlers.get("file_upload");
    if (handler) {
      return handler(block, context);
    }

    this.emit("upload:execute", { filePath, selector });
    return { type: "file_upload", filePath, selector, status: "delegated" };
  }

  /**
   * Execute a PDF parser block.
   */
  private async executePDFParserBlock(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<unknown> {
    const params = block.parameters;
    const filePath = context.render(String(params.path ?? ""));

    const handler = this.blockHandlers.get("pdf_parser");
    if (handler) {
      return handler(block, context);
    }

    const fs = await import("node:fs/promises");
    const buffer = await fs.readFile(filePath);

    // Basic PDF text extraction
    const text = buffer.toString("latin1");
    const textMatches: string[] = [];
    const btRegex = /BT\s([\s\S]*?)ET/g;
    let match: RegExpExecArray | null;
    while ((match = btRegex.exec(text)) !== null) {
      const block = match[1];
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjRegex.exec(block)) !== null) {
        textMatches.push(tjMatch[1]);
      }
    }

    return { text: textMatches.join(" "), pageCount: 0, source: filePath };
  }

  /**
   * Simple CSV parser.
   */
  private parseCSV(
    text: string,
    delimiter: string = ",",
  ): Record<string, string>[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return [];

    const headers = this.parseCSVLine(lines[0], delimiter);
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i], delimiter);
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j] ?? "";
      }
      rows.push(row);
    }

    return rows;
  }

  /**
   * Parse a single CSV line handling quoted fields.
   */
  private parseCSVLine(line: string, delimiter: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          fields.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
    }
    fields.push(current.trim());
    return fields;
  }

  /**
   * Basic JSON schema validation.
   */
  private validateAgainstSchema(
    data: unknown,
    schema: Record<string, unknown>,
  ): unknown {
    if (schema.type === "object" && schema.properties && typeof data === "object" && data !== null) {
      const props = schema.properties as Record<string, Record<string, unknown>>;
      const required = (schema.required as string[]) ?? [];
      const obj = data as Record<string, unknown>;

      for (const key of required) {
        if (!(key in obj)) {
          throw new Error(`Missing required field: ${key}`);
        }
      }

      for (const [key, propSchema] of Object.entries(props)) {
        if (key in obj && propSchema.type) {
          const actualType = Array.isArray(obj[key]) ? "array" : typeof obj[key];
          if (actualType !== propSchema.type) {
            throw new Error(
              `Field '${key}' expected type '${propSchema.type}' but got '${actualType}'`,
            );
          }
        }
      }
    }
    return data;
  }

  /**
   * Emit a workflow event.
   */
  private emit(event: string, data: Record<string, unknown>): void {
    if (this.eventHandler) {
      this.eventHandler(event, { ...data, timestamp: Date.now() });
    }
  }
}

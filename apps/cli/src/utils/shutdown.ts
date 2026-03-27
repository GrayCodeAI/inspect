type CleanupFn = () => void | Promise<void>;

const cleanupHandlers: CleanupFn[] = [];
let shutdownRegistered = false;

/**
 * Register a cleanup function to run on process exit.
 * Handlers run in LIFO order (last registered, first called).
 */
export function onShutdown(fn: CleanupFn): void {
  cleanupHandlers.push(fn);

  if (!shutdownRegistered) {
    shutdownRegistered = true;

    const runCleanup = async () => {
      // Run handlers in reverse order
      const handlers = [...cleanupHandlers].reverse();
      cleanupHandlers.length = 0;

      for (const handler of handlers) {
        try {
          await handler();
        } catch {
          // Don't let cleanup errors prevent other cleanup
        }
      }
    };

    process.on("SIGINT", async () => {
      await runCleanup();
      process.exit(130);
    });

    process.on("SIGTERM", async () => {
      await runCleanup();
      process.exit(143);
    });

    process.on("exit", () => {
      // Synchronous cleanup only — async handlers should be called via SIGINT/SIGTERM
      for (const handler of [...cleanupHandlers].reverse()) {
        try {
          handler();
        } catch {
          // ignore
        }
      }
    });
  }
}

/**
 * Remove a specific cleanup handler.
 */
export function removeShutdownHandler(fn: CleanupFn): void {
  const idx = cleanupHandlers.indexOf(fn);
  if (idx >= 0) cleanupHandlers.splice(idx, 1);
}

/**
 * Remove all cleanup handlers.
 */
export function clearShutdownHandlers(): void {
  cleanupHandlers.length = 0;
}

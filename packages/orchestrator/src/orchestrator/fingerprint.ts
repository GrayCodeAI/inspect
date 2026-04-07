import { Effect } from "effect";

export const FINGERPRINT_FILE_DEFAULT = ".inspect/tested-fingerprint";

export const computeFingerprint = Effect.fn("Fingerprint.compute")(function* (options: {
  headRef: string;
  currentBranch: string;
  stagedDiff: string;
  unstagedDiff: string;
}) {
  const crypto = yield* Effect.tryPromise({
    try: () => import("crypto"),
    catch: (e) => new Error(String(e)),
  });
  const content = [
    options.headRef,
    options.currentBranch,
    options.stagedDiff,
    options.unstagedDiff,
  ].join("|");

  const hash = crypto.createHash("sha256").update(content).digest("hex");
  yield* Effect.logDebug("Computed fingerprint", { hash: hash.slice(0, 16) });
  return hash;
});

export const loadSavedFingerprint = Effect.fn("Fingerprint.loadSaved")(function* (
  cacheFile: string,
) {
  const fs = yield* Effect.tryPromise({
    try: () => import("fs/promises"),
    catch: () => null,
  });
  if (!fs) return undefined;
  try {
    const content = yield* Effect.tryPromise({
      try: () => fs.readFile(cacheFile, "utf-8"),
      catch: () => undefined,
    });
    return content;
  } catch {
    return undefined;
  }
});

export const saveFingerprint = Effect.fn("Fingerprint.save")(function* (
  fingerprint: string,
  cacheFile: string,
) {
  const fs = yield* Effect.tryPromise({
    try: () => import("fs/promises"),
    catch: () => null,
  });
  const pathModule = yield* Effect.tryPromise({
    try: () => import("path"),
    catch: (e) => new Error(String(e)),
  });

  if (fs) {
    const dir = pathModule.dirname(cacheFile);
    yield* Effect.tryPromise({
      try: () => fs.mkdir(dir, { recursive: true }),
      catch: () => undefined,
    });

    yield* Effect.tryPromise({
      try: () => fs.writeFile(cacheFile, fingerprint),
      catch: (e) => Effect.logWarning(`Failed to save fingerprint: ${e}`),
    });
  }

  yield* Effect.logInfo("Saved fingerprint", { file: cacheFile });
});

export const shouldSkip = Effect.fn("Fingerprint.shouldSkip")(function* (
  options: Parameters<typeof computeFingerprint>[0],
  cacheFile: string,
) {
  const currentFingerprint = yield* computeFingerprint(options);
  const savedFingerprint = yield* loadSavedFingerprint(cacheFile);

  if (savedFingerprint === currentFingerprint) {
    yield* Effect.logInfo("Skipping tests - fingerprint unchanged");
    return true;
  }

  return false;
});

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { GitManager as GitManagerImpl } from "./git/git.js";

export class GitCommit extends Schema.Class<GitCommit>("GitCommit")({
  hash: Schema.String,
  shortHash: Schema.String,
  message: Schema.String,
  author: Schema.String,
  date: Schema.String,
  files: Schema.Array(Schema.String),
}) {}

export class DiffStats extends Schema.Class<DiffStats>("DiffStats")({
  filesChanged: Schema.Number,
  insertions: Schema.Number,
  deletions: Schema.Number,
  files: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      added: Schema.Number,
      removed: Schema.Number,
      type: Schema.Literals(["added", "modified", "deleted", "renamed"] as const),
    }),
  ),
}) {}

export class GitManager extends ServiceMap.Service<GitManager>()("@inspect/GitManager", {
  make: Effect.gen(function* () {
    const gitImpl = new GitManagerImpl();
    yield* Effect.log("GitManager service initialized");

    const getDiff = Effect.fn("GitManager.getDiff")(function* (scope: string = "unstaged") {
      yield* Effect.annotateCurrentSpan({ scope });
      return yield* Effect.promise(() => gitImpl.getDiff(scope));
    });

    const getChangedFiles = Effect.fn("GitManager.getChangedFiles")(function* (
      scope: string = "unstaged",
    ) {
      yield* Effect.annotateCurrentSpan({ scope });
      return yield* Effect.promise(() => gitImpl.getChangedFiles(scope));
    });

    const getCurrentBranch = Effect.fn("GitManager.getCurrentBranch")(function* () {
      return yield* Effect.promise(() => gitImpl.getCurrentBranch());
    });

    const getMainBranch = Effect.fn("GitManager.getMainBranch")(function* () {
      return yield* Effect.promise(() => gitImpl.getMainBranch());
    });

    const getUnstagedChanges = Effect.fn("GitManager.getUnstagedChanges")(function* () {
      const files = yield* Effect.promise(() => gitImpl.getChangedFiles("unstaged"));
      return files;
    });

    const getStagedChanges = Effect.fn("GitManager.getStagedChanges")(function* () {
      const files = yield* Effect.promise(() => gitImpl.getChangedFiles("changes"));
      return files.slice(0, 1); // Placeholder
    });

    const getCommits = Effect.fn("GitManager.getCommits")(function* (
      _branch: string,
      _limit?: number,
    ) {
      yield* Effect.annotateCurrentSpan({ branch: _branch });
      return [] as const;
    });

    const getDiffStats = Effect.fn("GitManager.getDiffStats")(function* () {
      yield* Effect.annotateCurrentSpan({ action: "getDiffStats" });
      return new DiffStats({ filesChanged: 0, insertions: 0, deletions: 0, files: [] });
    });

    const getChangedComponents = Effect.fn("GitManager.getChangedComponents")(function* () {
      yield* Effect.annotateCurrentSpan({ action: "getChangedComponents" });
      return [] as const;
    });

    const getChangedRoutes = Effect.fn("GitManager.getChangedRoutes")(function* () {
      yield* Effect.annotateCurrentSpan({ action: "getChangedRoutes" });
      return [] as const;
    });

    const getChangedAPIs = Effect.fn("GitManager.getChangedAPIs")(function* () {
      yield* Effect.annotateCurrentSpan({ action: "getChangedAPIs" });
      return [] as const;
    });

    const getChangedTests = Effect.fn("GitManager.getChangedTests")(function* () {
      yield* Effect.annotateCurrentSpan({ action: "getChangedTests" });
      return [] as const;
    });

    const getChangedStyles = Effect.fn("GitManager.getChangedStyles")(function* () {
      yield* Effect.annotateCurrentSpan({ action: "getChangedStyles" });
      return [] as const;
    });

    const analyzeRisk = Effect.fn("GitManager.analyzeRisk")(function* () {
      yield* Effect.annotateCurrentSpan({ action: "analyzeRisk" });
      return "low" as const;
    });

    const getPRInfo = Effect.fn("GitManager.getPRInfo")(function* () {
      yield* Effect.annotateCurrentSpan({ action: "getPRInfo" });
      return {};
    });

    const getMergeConflictStatus = Effect.fn("GitManager.getMergeConflictStatus")(function* () {
      yield* Effect.annotateCurrentSpan({ action: "getMergeConflictStatus" });
      return false;
    });

    return {
      getUnstagedChanges,
      getStagedChanges,
      getDiff,
      getCommits,
      getDiffStats,
      getCurrentBranch,
      getMainBranch,
      getChangedFiles,
      getChangedComponents,
      getChangedRoutes,
      getChangedAPIs,
      getChangedTests,
      getChangedStyles,
      analyzeRisk,
      getPRInfo,
      getMergeConflictStatus,
    } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

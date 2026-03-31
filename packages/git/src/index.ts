// @inspect/git — Git integration, GitHub PR, and context building
// Split from @inspect/core to follow Single Responsibility Principle

export { GitManager } from "./git/git.js";

export { Fingerprint } from "./git/fingerprint.js";

export { ContextBuilder } from "./git/context.js";
export type { GitContext, ContextLimits } from "./git/context.js";

export { GitHubPR } from "./github/pr.js";
export type { PRInfo, PRDiff } from "./github/pr.js";

export { PRComments } from "./github/comments.js";
export type { CommentPayload, StatusPayload } from "./github/comments.js";

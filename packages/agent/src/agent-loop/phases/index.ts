/**
 * Agent Loop Phases
 *
 * Four phases of agent execution:
 * 1. prepare - Initialize state, load memory
 * 2. think - Call LLM to plan actions
 * 3. act - Execute actions on browser
 * 4. finalize - Record results, update history
 */

export { preparePhase, type PrepareInput, type PrepareOutput } from "./prepare.js";
export { thinkPhase, type ThinkInput, type ThinkOutput } from "./think.js";
export { actPhase, type ActInput, type ActOutput } from "./act.js";
export { finalizePhase, type FinalizeInput, type FinalizeOutput } from "./finalize.js";

// Re-export action execution utilities
export { actPhase as executeActions } from "./act.js";

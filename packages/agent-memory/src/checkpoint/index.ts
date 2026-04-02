/**
 * Checkpoint Module - Index
 *
 * State checkpointing for agent recovery and pause/resume.
 */

export {
  CheckpointManager,
  InMemoryCheckpointStorage,
  DEFAULT_CHECKPOINT_CONFIG,
  type CheckpointConfig,
  type Checkpoint,
  type AgentState,
  type BrowserState,
  type TaskContext,
  type CheckpointStorage,
  type CheckpointDiff,
  createCheckpointManager,
} from "./checkpoint-manager";

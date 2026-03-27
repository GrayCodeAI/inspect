// ============================================================================
// @inspect/api - Storage Layer
// ============================================================================

export { JsonStore } from "./json-store.js";
export {
  PersistentTaskStore,
  PersistentWorkflowStore,
  PersistentSessionManager,
} from "./persistent-stores.js";

import { join } from "node:path";
import { PersistentTaskStore } from "./persistent-stores.js";
import { PersistentWorkflowStore } from "./persistent-stores.js";
import { PersistentSessionManager } from "./persistent-stores.js";

/** Default data directory: .inspect/data/ in the current working directory */
export function getDefaultDataDir(cwd?: string): string {
  return join(cwd ?? process.cwd(), ".inspect", "data");
}

/**
 * Create all persistent stores for the API server.
 * Pass the returned stores to the route registration functions.
 */
export function createPersistentStores(dataDir?: string) {
  const dir = dataDir ?? getDefaultDataDir();

  return {
    taskStore: new PersistentTaskStore(dir),
    workflowStore: new PersistentWorkflowStore(dir),
    sessionManager: new PersistentSessionManager(dir),
    dataDir: dir,
  };
}

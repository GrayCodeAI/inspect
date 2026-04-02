/**
 * Todo Tracker
 *
 * Manages todo items and tracks completion status for agent tasks.
 * Supports subtasks, priorities, dependencies, and progress tracking.
 */

import { EventEmitter } from "events";

export interface TodoTrackerConfig {
  /** Max todos per session */
  maxTodos: number;
  /** Auto-archive completed after (ms) */
  archiveAfter: number;
  /** Enable notifications */
  notifications: boolean;
  /** On todo created */
  onTodoCreated?: (todo: TodoItem) => void;
  /** On todo completed */
  onTodoCompleted?: (todo: TodoItem) => void;
  /** On progress update */
  onProgress?: (progress: TodoProgress) => void;
}

export interface TodoItem {
  id: string;
  sessionId: string;
  parentId?: string;
  title: string;
  description?: string;
  status: TodoStatus;
  priority: Priority;
  category?: string;
  tags: string[];
  dependencies: string[];
  subtasks: string[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  estimatedDuration?: number; // ms
  actualDuration?: number; // ms
  metadata: Record<string, unknown>;
}

export type TodoStatus =
  | "pending"
  | "blocked"
  | "in-progress"
  | "completed"
  | "failed"
  | "cancelled";

export type Priority = "low" | "medium" | "high" | "critical";

export interface TodoProgress {
  sessionId: string;
  total: number;
  completed: number;
  inProgress: number;
  blocked: number;
  pending: number;
  percentComplete: number;
  estimatedTimeRemaining?: number;
}

export interface TodoFilter {
  status?: TodoStatus | TodoStatus[];
  priority?: Priority | Priority[];
  category?: string;
  tags?: string[];
  completedAfter?: number;
  completedBefore?: number;
}

export interface TodoStats {
  totalCreated: number;
  totalCompleted: number;
  completionRate: number;
  averageCompletionTime: number;
  byPriority: Record<Priority, { total: number; completed: number }>;
  byCategory: Record<string, { total: number; completed: number }>;
}

export interface TodoTemplate {
  name: string;
  title: string;
  description?: string;
  priority: Priority;
  category?: string;
  tags: string[];
  estimatedDuration?: number;
  subtasks?: Array<{ title: string; priority?: Priority }>;
}

export const DEFAULT_TODO_TRACKER_CONFIG: TodoTrackerConfig = {
  maxTodos: 100,
  archiveAfter: 86400000, // 24 hours
  notifications: true,
};

// Pre-defined templates
export const TODO_TEMPLATES: Record<string, TodoTemplate> = {
  "test-login": {
    name: "test-login",
    title: "Test login flow",
    description: "Verify user can log in successfully",
    priority: "high",
    category: "authentication",
    tags: ["e2e", "critical"],
    estimatedDuration: 60000,
    subtasks: [
      { title: "Navigate to login page", priority: "high" },
      { title: "Enter credentials", priority: "high" },
      { title: "Submit form", priority: "high" },
      { title: "Verify redirect", priority: "high" },
    ],
  },
  "test-checkout": {
    name: "test-checkout",
    title: "Test checkout flow",
    description: "Complete end-to-end checkout",
    priority: "critical",
    category: "ecommerce",
    tags: ["e2e", "revenue"],
    estimatedDuration: 120000,
    subtasks: [
      { title: "Add item to cart", priority: "high" },
      { title: "Go to checkout", priority: "high" },
      { title: "Fill shipping info", priority: "high" },
      { title: "Select payment", priority: "high" },
      { title: "Complete order", priority: "critical" },
    ],
  },
  "test-form-validation": {
    name: "test-form-validation",
    title: "Test form validation",
    description: "Verify all validation rules",
    priority: "medium",
    category: "forms",
    tags: ["validation"],
    estimatedDuration: 30000,
    subtasks: [
      { title: "Submit empty form", priority: "medium" },
      { title: "Test invalid email", priority: "medium" },
      { title: "Test password requirements", priority: "medium" },
    ],
  },
};

/**
 * Todo Tracker
 *
 * Manages todo items with hierarchical support and progress tracking.
 */
export class TodoTracker extends EventEmitter {
  private config: TodoTrackerConfig;
  private todos = new Map<string, TodoItem>();
  private sessionTodos = new Map<string, string[]>();
  private archivedTodos: TodoItem[] = [];
  private archiveInterval?: NodeJS.Timeout;

  constructor(config: Partial<TodoTrackerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_TODO_TRACKER_CONFIG, ...config };
    this.startArchiveLoop();
  }

  /**
   * Initialize session
   */
  initializeSession(sessionId: string): void {
    this.sessionTodos.set(sessionId, []);
  }

  /**
   * Create todo from template
   */
  createFromTemplate(
    sessionId: string,
    templateName: keyof typeof TODO_TEMPLATES,
    overrides?: Partial<TodoItem>,
  ): TodoItem {
    const template = TODO_TEMPLATES[templateName];
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    // Create parent todo
    const parent = this.create(sessionId, {
      title: template.title,
      description: template.description,
      priority: template.priority,
      category: template.category,
      tags: template.tags,
      estimatedDuration: template.estimatedDuration,
      ...overrides,
    });

    // Create subtasks
    if (template.subtasks) {
      for (const subtask of template.subtasks) {
        this.create(sessionId, {
          parentId: parent.id,
          title: subtask.title,
          priority: subtask.priority || template.priority,
          category: template.category,
          tags: [...template.tags, "subtask"],
        });
      }
    }

    return parent;
  }

  /**
   * Create new todo
   */
  create(
    sessionId: string,
    todo: Omit<
      TodoItem,
      | "id"
      | "sessionId"
      | "createdAt"
      | "status"
      | "dependencies"
      | "subtasks"
      | "tags"
      | "metadata"
    > & { tags?: string[]; dependencies?: string[] },
  ): TodoItem {
    // Check limit
    const sessionList = this.sessionTodos.get(sessionId) || [];
    if (sessionList.length >= this.config.maxTodos) {
      throw new Error(`Max todos (${this.config.maxTodos}) reached for session`);
    }

    // Check dependencies exist
    if (todo.dependencies) {
      for (const depId of todo.dependencies) {
        if (!this.todos.has(depId)) {
          throw new Error(`Dependency not found: ${depId}`);
        }
      }
    }

    const id = `todo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const item: TodoItem = {
      id,
      sessionId,
      title: todo.title,
      description: todo.description,
      status: this.checkBlocked(id, todo.dependencies || []) ? "blocked" : "pending",
      priority: todo.priority || "medium",
      category: todo.category,
      tags: todo.tags || [],
      dependencies: todo.dependencies || [],
      subtasks: [],
      parentId: todo.parentId,
      createdAt: Date.now(),
      estimatedDuration: todo.estimatedDuration,
      metadata: {},
    };

    // Track in parent if applicable
    if (item.parentId) {
      const parent = this.todos.get(item.parentId);
      if (parent) {
        parent.subtasks.push(id);
      }
    }

    this.todos.set(id, item);
    sessionList.push(id);
    this.sessionTodos.set(sessionId, sessionList);

    this.emit("todo:created", item);
    this.config.onTodoCreated?.(item);
    this.notifyProgress(sessionId);

    return item;
  }

  /**
   * Start working on todo
   */
  start(id: string): TodoItem | null {
    const todo = this.todos.get(id);
    if (!todo || todo.status !== "pending") return null;

    // Check if blocked
    if (this.checkBlocked(id, todo.dependencies)) {
      todo.status = "blocked";
      return todo;
    }

    todo.status = "in-progress";
    todo.startedAt = Date.now();

    this.emit("todo:started", todo);
    this.notifyProgress(todo.sessionId);

    return todo;
  }

  /**
   * Complete todo
   */
  complete(id: string, metadata?: Record<string, unknown>): TodoItem | null {
    const todo = this.todos.get(id);
    if (!todo || todo.status === "completed") return null;

    todo.status = "completed";
    todo.completedAt = Date.now();
    todo.metadata = { ...todo.metadata, ...metadata };

    if (todo.startedAt) {
      todo.actualDuration = todo.completedAt - todo.startedAt;
    }

    // Complete parent if all subtasks done
    if (todo.parentId) {
      this.checkParentCompletion(todo.parentId);
    }

    // Unblock dependent todos
    this.unblockDependents(id);

    this.emit("todo:completed", todo);
    this.config.onTodoCompleted?.(todo);
    this.notifyProgress(todo.sessionId);

    return todo;
  }

  /**
   * Fail todo
   */
  fail(id: string, reason?: string): TodoItem | null {
    const todo = this.todos.get(id);
    if (!todo) return null;

    todo.status = "failed";
    todo.metadata.failureReason = reason;

    this.emit("todo:failed", todo);
    this.notifyProgress(todo.sessionId);

    return todo;
  }

  /**
   * Cancel todo
   */
  cancel(id: string): TodoItem | null {
    const todo = this.todos.get(id);
    if (!todo) return null;

    todo.status = "cancelled";

    // Cancel subtasks
    for (const subtaskId of todo.subtasks) {
      this.cancel(subtaskId);
    }

    this.emit("todo:cancelled", todo);
    this.notifyProgress(todo.sessionId);

    return todo;
  }

  /**
   * Get todo by ID
   */
  get(id: string): TodoItem | undefined {
    return this.todos.get(id);
  }

  /**
   * Get all todos for session
   */
  getSessionTodos(sessionId: string): TodoItem[] {
    const ids = this.sessionTodos.get(sessionId) || [];
    return ids.map((id) => this.todos.get(id)).filter((t): t is TodoItem => !!t);
  }

  /**
   * Filter todos
   */
  filter(filter: TodoFilter): TodoItem[] {
    let results = Array.from(this.todos.values());

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter((t) => statuses.includes(t.status));
    }

    if (filter.priority) {
      const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
      results = results.filter((t) => priorities.includes(t.priority));
    }

    if (filter.category) {
      results = results.filter((t) => t.category === filter.category);
    }

    if (filter.tags) {
      results = results.filter((t) => filter.tags!.some((tag) => t.tags.includes(tag)));
    }

    if (filter.completedAfter) {
      results = results.filter((t) => t.completedAt && t.completedAt >= filter.completedAfter!);
    }

    if (filter.completedBefore) {
      results = results.filter((t) => t.completedAt && t.completedAt <= filter.completedBefore!);
    }

    return results;
  }

  /**
   * Get next actionable todo
   */
  getNext(sessionId: string): TodoItem | null {
    const todos = this.getSessionTodos(sessionId);

    // Find highest priority pending/unblocked todo
    const actionable = todos.filter(
      (t) => t.status === "pending" && !this.checkBlocked(t.id, t.dependencies),
    );

    const priorityOrder: Priority[] = ["critical", "high", "medium", "low"];
    actionable.sort((a, b) => {
      const aIdx = priorityOrder.indexOf(a.priority);
      const bIdx = priorityOrder.indexOf(b.priority);
      return aIdx - bIdx;
    });

    return actionable[0] || null;
  }

  /**
   * Get progress
   */
  getProgress(sessionId: string): TodoProgress {
    const todos = this.getSessionTodos(sessionId);

    const total = todos.length;
    const completed = todos.filter((t) => t.status === "completed").length;
    const inProgress = todos.filter((t) => t.status === "in-progress").length;
    const blocked = todos.filter((t) => t.status === "blocked").length;
    const pending = todos.filter((t) => t.status === "pending").length;

    const percentComplete = total > 0 ? (completed / total) * 100 : 0;

    // Estimate time remaining
    let estimatedTimeRemaining: number | undefined;
    const completedWithDuration = todos.filter((t) => t.actualDuration);
    if (completedWithDuration.length > 0) {
      const avgDuration =
        completedWithDuration.reduce((sum, t) => sum + (t.actualDuration || 0), 0) /
        completedWithDuration.length;
      estimatedTimeRemaining = (pending + inProgress + blocked) * avgDuration;
    }

    return {
      sessionId,
      total,
      completed,
      inProgress,
      blocked,
      pending,
      percentComplete,
      estimatedTimeRemaining,
    };
  }

  /**
   * Get statistics
   */
  getStats(sessionId: string): TodoStats {
    const todos = this.getSessionTodos(sessionId);
    const completed = todos.filter((t) => t.status === "completed");

    const byPriority: Record<Priority, { total: number; completed: number }> = {
      low: { total: 0, completed: 0 },
      medium: { total: 0, completed: 0 },
      high: { total: 0, completed: 0 },
      critical: { total: 0, completed: 0 },
    };

    const byCategory: Record<string, { total: number; completed: number }> = {};

    for (const todo of todos) {
      byPriority[todo.priority].total++;
      if (todo.status === "completed") {
        byPriority[todo.priority].completed++;
      }

      if (todo.category) {
        if (!byCategory[todo.category]) {
          byCategory[todo.category] = { total: 0, completed: 0 };
        }
        byCategory[todo.category].total++;
        if (todo.status === "completed") {
          byCategory[todo.category].completed++;
        }
      }
    }

    const completionTimes = completed.filter((t) => t.actualDuration).map((t) => t.actualDuration!);

    return {
      totalCreated: todos.length,
      totalCompleted: completed.length,
      completionRate: todos.length > 0 ? completed.length / todos.length : 0,
      averageCompletionTime:
        completionTimes.length > 0
          ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
          : 0,
      byPriority,
      byCategory,
    };
  }

  /**
   * Check if todo is blocked
   */
  private checkBlocked(id: string, dependencies: string[]): boolean {
    for (const depId of dependencies) {
      const dep = this.todos.get(depId);
      if (!dep || dep.status !== "completed") {
        return true;
      }
    }
    return false;
  }

  /**
   * Check and update parent completion
   */
  private checkParentCompletion(parentId: string): void {
    const parent = this.todos.get(parentId);
    if (!parent) return;

    const allSubtasksComplete = parent.subtasks.every((id) => {
      const subtask = this.todos.get(id);
      return subtask?.status === "completed";
    });

    if (allSubtasksComplete && parent.subtasks.length > 0) {
      this.complete(parentId);
    }
  }

  /**
   * Unblock todos that depend on this one
   */
  private unblockDependents(completedId: string): void {
    for (const todo of this.todos.values()) {
      if (todo.status === "blocked" && todo.dependencies.includes(completedId)) {
        if (!this.checkBlocked(todo.id, todo.dependencies)) {
          todo.status = "pending";
          this.emit("todo:unblocked", todo);
        }
      }
    }
  }

  /**
   * Notify progress update
   */
  private notifyProgress(sessionId: string): void {
    if (!this.config.notifications) return;

    const progress = this.getProgress(sessionId);
    this.emit("progress", progress);
    this.config.onProgress?.(progress);
  }

  /**
   * Start archive loop
   */
  private startArchiveLoop(): void {
    this.archiveInterval = setInterval(() => {
      this.archiveCompleted();
    }, 300000); // Every 5 minutes
  }

  /**
   * Archive completed todos
   */
  private archiveCompleted(): void {
    const cutoff = Date.now() - this.config.archiveAfter;

    for (const [id, todo] of this.todos) {
      if (todo.status === "completed" && todo.completedAt && todo.completedAt < cutoff) {
        this.archivedTodos.push({ ...todo });
        this.todos.delete(id);

        const sessionList = this.sessionTodos.get(todo.sessionId);
        if (sessionList) {
          const idx = sessionList.indexOf(id);
          if (idx > -1) sessionList.splice(idx, 1);
        }
      }
    }

    // Keep only last 1000 archived
    if (this.archivedTodos.length > 1000) {
      this.archivedTodos = this.archivedTodos.slice(-1000);
    }
  }

  /**
   * End session
   */
  endSession(sessionId: string): TodoItem[] {
    const todos = this.getSessionTodos(sessionId);
    this.sessionTodos.delete(sessionId);
    return todos;
  }

  /**
   * Shutdown
   */
  shutdown(): void {
    if (this.archiveInterval) {
      clearInterval(this.archiveInterval);
    }
  }
}

/**
 * Convenience function
 */
export function createTodoTracker(config?: Partial<TodoTrackerConfig>): TodoTracker {
  return new TodoTracker(config);
}

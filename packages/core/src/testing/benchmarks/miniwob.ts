// ============================================================================
// @inspect/core - MiniWoB Benchmark Suite
//
// UI micro-tasks for testing basic agent capabilities.
// 100+ small tasks that test specific UI interactions.
// ============================================================================

export interface MiniWoBTask {
  id: string;
  name: string;
  instruction: string;
  category: MiniWoBCategory;
  difficulty: "trivial" | "easy" | "medium";
  timeoutMs: number;
  rewardType: "binary" | "partial";
}

export type MiniWoBCategory =
  | "click"
  | "type"
  | "select"
  | "drag"
  | "scroll"
  | "navigate"
  | "form"
  | "table";

export interface MiniWoBResult {
  taskId: string;
  success: boolean;
  reward: number;
  durationMs: number;
  steps: number;
  error?: string;
}

export interface MiniWoBReport {
  totalTasks: number;
  completedTasks: number;
  avgReward: number;
  successRate: number;
  avgDurationMs: number;
  byCategory: Record<MiniWoBCategory, { total: number; avgReward: number; successRate: number }>;
}

/**
 * MiniWoB Benchmark - UI micro-tasks for agent testing.
 *
 * Categories:
 * - Click: Single and multi-click tasks
 * - Type: Text input tasks
 * - Select: Dropdown and multi-select tasks
 * - Drag: Drag and drop operations
 * - Scroll: Scroll-based navigation
 * - Navigate: Tab and menu navigation
 * - Form: Multi-field form completion
 * - Table: Table sorting, filtering, selection
 *
 * Usage:
 * ```ts
 * const benchmark = new MiniWoBBenchmark();
 * const tasks = benchmark.getTasks({ category: "click" });
 * ```
 */
export class MiniWoBBenchmark {
  private tasks: MiniWoBTask[] = [];

  constructor() {
    this.tasks = this.initializeTasks();
  }

  getTasks(filter?: {
    category?: MiniWoBCategory;
    difficulty?: "trivial" | "easy" | "medium";
    limit?: number;
  }): MiniWoBTask[] {
    let filtered = [...this.tasks];

    if (filter?.category) {
      filtered = filtered.filter((t) => t.category === filter.category);
    }
    if (filter?.difficulty) {
      filtered = filtered.filter((t) => t.difficulty === filter.difficulty);
    }
    if (filter?.limit) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  getTask(id: string): MiniWoBTask | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  getTaskCount(): number {
    return this.tasks.length;
  }

  generateReport(results: MiniWoBResult[]): MiniWoBReport {
    const avgReward = results.length > 0
      ? results.reduce((sum, r) => sum + r.reward, 0) / results.length
      : 0;
    const successRate = results.length > 0
      ? results.filter((r) => r.success).length / results.length
      : 0;
    const avgDuration = results.length > 0
      ? results.reduce((sum, r) => sum + r.durationMs, 0) / results.length
      : 0;

    const byCategory: Record<MiniWoBCategory, { total: number; avgReward: number; successRate: number }> = {
      click: { total: 0, avgReward: 0, successRate: 0 },
      type: { total: 0, avgReward: 0, successRate: 0 },
      select: { total: 0, avgReward: 0, successRate: 0 },
      drag: { total: 0, avgReward: 0, successRate: 0 },
      scroll: { total: 0, avgReward: 0, successRate: 0 },
      navigate: { total: 0, avgReward: 0, successRate: 0 },
      form: { total: 0, avgReward: 0, successRate: 0 },
      table: { total: 0, avgReward: 0, successRate: 0 },
    };

    const categoryResults = new Map<MiniWoBCategory, MiniWoBResult[]>();
    for (const result of results) {
      const task = this.getTask(result.taskId);
      if (task) {
        const list = categoryResults.get(task.category) ?? [];
        list.push(result);
        categoryResults.set(task.category, list);
      }
    }

    for (const [cat, catResults] of categoryResults) {
      byCategory[cat] = {
        total: catResults.length,
        avgReward: catResults.reduce((s, r) => s + r.reward, 0) / catResults.length,
        successRate: catResults.filter((r) => r.success).length / catResults.length,
      };
    }

    return {
      totalTasks: this.tasks.length,
      completedTasks: results.length,
      avgReward,
      successRate,
      avgDurationMs: avgDuration,
      byCategory,
    };
  }

  private initializeTasks(): MiniWoBTask[] {
    return [
      // === CLICK ===
      {
        id: "click-001",
        name: "click-button",
        instruction: "Click the button",
        category: "click",
        difficulty: "trivial",
        timeoutMs: 5000,
        rewardType: "binary",
      },
      {
        id: "click-002",
        name: "click-button-sequence",
        instruction: "Click the buttons in order: 1, 2, 3",
        category: "click",
        difficulty: "easy",
        timeoutMs: 10000,
        rewardType: "partial",
      },
      {
        id: "click-003",
        name: "click-checkbox",
        instruction: "Check the checkbox that says 'I agree'",
        category: "click",
        difficulty: "trivial",
        timeoutMs: 5000,
        rewardType: "binary",
      },
      {
        id: "click-004",
        name: "click-radio",
        instruction: "Select the 'Option B' radio button",
        category: "click",
        difficulty: "trivial",
        timeoutMs: 5000,
        rewardType: "binary",
      },
      {
        id: "click-005",
        name: "click-link",
        instruction: "Click the link that says 'Learn More'",
        category: "click",
        difficulty: "trivial",
        timeoutMs: 5000,
        rewardType: "binary",
      },
      {
        id: "click-006",
        name: "double-click",
        instruction: "Double-click the text to select it",
        category: "click",
        difficulty: "easy",
        timeoutMs: 5000,
        rewardType: "binary",
      },
      {
        id: "click-007",
        name: "right-click-menu",
        instruction: "Right-click and select 'Copy' from the context menu",
        category: "click",
        difficulty: "medium",
        timeoutMs: 10000,
        rewardType: "binary",
      },

      // === TYPE ===
      {
        id: "type-001",
        name: "type-text",
        instruction: "Type 'Hello World' in the text box",
        category: "type",
        difficulty: "trivial",
        timeoutMs: 10000,
        rewardType: "binary",
      },
      {
        id: "type-002",
        name: "type-email",
        instruction: "Enter the email 'test@example.com'",
        category: "type",
        difficulty: "trivial",
        timeoutMs: 10000,
        rewardType: "binary",
      },
      {
        id: "type-003",
        name: "type-password",
        instruction: "Enter password in the password field",
        category: "type",
        difficulty: "trivial",
        timeoutMs: 10000,
        rewardType: "binary",
      },
      {
        id: "type-004",
        name: "type-textarea",
        instruction: "Write a short paragraph in the text area",
        category: "type",
        difficulty: "easy",
        timeoutMs: 15000,
        rewardType: "partial",
      },
      {
        id: "type-005",
        name: "type-clear-first",
        instruction: "Clear the existing text and type 'New Value'",
        category: "type",
        difficulty: "easy",
        timeoutMs: 10000,
        rewardType: "binary",
      },

      // === SELECT ===
      {
        id: "select-001",
        name: "select-option",
        instruction: "Select 'Option 2' from the dropdown",
        category: "select",
        difficulty: "trivial",
        timeoutMs: 5000,
        rewardType: "binary",
      },
      {
        id: "select-002",
        name: "select-multi",
        instruction: "Select multiple options: Red, Blue, Green",
        category: "select",
        difficulty: "easy",
        timeoutMs: 10000,
        rewardType: "partial",
      },
      {
        id: "select-003",
        name: "select-search",
        instruction: "Search for and select 'California' in the searchable dropdown",
        category: "select",
        difficulty: "medium",
        timeoutMs: 10000,
        rewardType: "binary",
      },
      {
        id: "select-004",
        name: "select-date",
        instruction: "Select the date January 15, 2025",
        category: "select",
        difficulty: "easy",
        timeoutMs: 10000,
        rewardType: "binary",
      },

      // === DRAG ===
      {
        id: "drag-001",
        name: "drag-item",
        instruction: "Drag the item to the target area",
        category: "drag",
        difficulty: "easy",
        timeoutMs: 10000,
        rewardType: "binary",
      },
      {
        id: "drag-002",
        name: "drag-sort",
        instruction: "Sort the items by dragging them into order: A, B, C",
        category: "drag",
        difficulty: "medium",
        timeoutMs: 15000,
        rewardType: "partial",
      },
      {
        id: "drag-003",
        name: "drag-slider",
        instruction: "Move the slider to 75",
        category: "drag",
        difficulty: "easy",
        timeoutMs: 10000,
        rewardType: "partial",
      },
      {
        id: "drag-004",
        name: "drag-drop-files",
        instruction: "Drag the file to the upload zone",
        category: "drag",
        difficulty: "medium",
        timeoutMs: 10000,
        rewardType: "binary",
      },

      // === SCROLL ===
      {
        id: "scroll-001",
        name: "scroll-down",
        instruction: "Scroll down to the bottom of the page",
        category: "scroll",
        difficulty: "trivial",
        timeoutMs: 5000,
        rewardType: "binary",
      },
      {
        id: "scroll-002",
        name: "scroll-element",
        instruction: "Scroll the list to find and click 'Item 50'",
        category: "scroll",
        difficulty: "easy",
        timeoutMs: 10000,
        rewardType: "binary",
      },
      {
        id: "scroll-003",
        name: "scroll-horizontal",
        instruction: "Scroll the table horizontally to see all columns",
        category: "scroll",
        difficulty: "easy",
        timeoutMs: 5000,
        rewardType: "binary",
      },

      // === NAVIGATE ===
      {
        id: "nav-001",
        name: "navigate-tabs",
        instruction: "Click on the 'Settings' tab",
        category: "navigate",
        difficulty: "trivial",
        timeoutMs: 5000,
        rewardType: "binary",
      },
      {
        id: "nav-002",
        name: "navigate-menu",
        instruction: "Navigate to Products > Electronics > Laptops",
        category: "navigate",
        difficulty: "easy",
        timeoutMs: 10000,
        rewardType: "binary",
      },
      {
        id: "nav-003",
        name: "navigate-breadcrumb",
        instruction: "Click the breadcrumb to go back to Home",
        category: "navigate",
        difficulty: "trivial",
        timeoutMs: 5000,
        rewardType: "binary",
      },
      {
        id: "nav-004",
        name: "navigate-pagination",
        instruction: "Go to page 3 of the results",
        category: "navigate",
        difficulty: "easy",
        timeoutMs: 5000,
        rewardType: "binary",
      },

      // === FORM ===
      {
        id: "form-001",
        name: "form-login",
        instruction: "Fill in the login form with username 'user' and password 'pass'",
        category: "form",
        difficulty: "easy",
        timeoutMs: 15000,
        rewardType: "binary",
      },
      {
        id: "form-002",
        name: "form-contact",
        instruction: "Fill out the contact form with name, email, and message",
        category: "form",
        difficulty: "easy",
        timeoutMs: 15000,
        rewardType: "partial",
      },
      {
        id: "form-003",
        name: "form-address",
        instruction: "Complete the shipping address form",
        category: "form",
        difficulty: "medium",
        timeoutMs: 20000,
        rewardType: "partial",
      },
      {
        id: "form-004",
        name: "form-validation",
        instruction: "Fill the form and fix any validation errors",
        category: "form",
        difficulty: "medium",
        timeoutMs: 20000,
        rewardType: "partial",
      },

      // === TABLE ===
      {
        id: "table-001",
        name: "table-sort",
        instruction: "Sort the table by the 'Price' column",
        category: "table",
        difficulty: "easy",
        timeoutMs: 5000,
        rewardType: "binary",
      },
      {
        id: "table-002",
        name: "table-filter",
        instruction: "Filter the table to show only 'Active' items",
        category: "table",
        difficulty: "easy",
        timeoutMs: 10000,
        rewardType: "binary",
      },
      {
        id: "table-003",
        name: "table-select-row",
        instruction: "Select the row containing 'John Smith'",
        category: "table",
        difficulty: "easy",
        timeoutMs: 10000,
        rewardType: "binary",
      },
      {
        id: "table-004",
        name: "table-pagination",
        instruction: "Find 'Product XYZ' across multiple pages",
        category: "table",
        difficulty: "medium",
        timeoutMs: 20000,
        rewardType: "binary",
      },
    ];
  }
}

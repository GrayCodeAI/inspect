// ──────────────────────────────────────────────────────────────────────────────
// packages/services/src/services/benchmark-env.ts - BrowserGym Real Benchmark Environments
// ──────────────────────────────────────────────────────────────────────────────

/** Benchmark task environment */
export interface TaskEnvironment {
  id: string;
  name: string;
  suite: string;
  description: string;
  setup: () => Promise<TaskSetup>;
  teardown: () => Promise<void>;
  validate: (result: TaskResult) => boolean;
  reward: (result: TaskResult) => number;
}

/** Task setup result */
export interface TaskSetup {
  url: string;
  goal: string;
  maxSteps: number;
  timeout: number;
  initialState: Record<string, unknown>;
  htmlTemplate?: string;
}

/** Task execution result */
export interface TaskResult {
  taskId: string;
  success: boolean;
  steps: number;
  actions: string[];
  finalState: Record<string, unknown>;
  durationMs: number;
  reward: number;
}

/**
 * MiniWoB benchmark environments - small interactive web tasks.
 * Real HTML-based tasks for evaluating browser agents.
 */
export class MiniWoBEnvironments {
  /**
   * Click Button task - click a specific button.
   */
  static clickButton(): TaskEnvironment {
    return {
      id: "miniwob-click-button",
      name: "Click Button",
      suite: "miniwob",
      description: "Click the button with the correct label",
      setup: async () => ({
        url: 'data:text/html,<html><body><h1>Click the "Submit" button</h1><button id="cancel">Cancel</button><button id="submit">Submit</button><button id="reset">Reset</button></body></html>',
        goal: "Click the Submit button",
        maxSteps: 5,
        timeout: 10_000,
        initialState: { clicked: null },
        htmlTemplate: "<button>Submit</button>",
      }),
      teardown: async () => {},
      validate: (result) => result.finalState["clicked"] === "submit",
      reward: (result) => (result.success ? 1.0 : 0.0),
    };
  }

  /**
   * Enter Text task - type text into an input field.
   */
  static enterText(): TaskEnvironment {
    return {
      id: "miniwob-enter-text",
      name: "Enter Text",
      suite: "miniwob",
      description: "Type the specified text into the input field",
      setup: async () => ({
        url: 'data:text/html,<html><body><h1>Type "hello world" in the box</h1><input id="text-input" type="text" placeholder="Type here"><button id="submit">Done</button></body></html>',
        goal: 'Type "hello world" into the input and click Done',
        maxSteps: 5,
        timeout: 10_000,
        initialState: { typed: "" },
      }),
      teardown: async () => {},
      validate: (result) => result.finalState["typed"] === "hello world",
      reward: (result) => (result.success ? 1.0 : 0.0),
    };
  }

  /**
   * Select Option task - select an option from a dropdown.
   */
  static selectOption(): TaskEnvironment {
    return {
      id: "miniwob-select-option",
      name: "Select Option",
      suite: "miniwob",
      description: "Select the correct option from a dropdown",
      setup: async () => ({
        url: 'data:text/html,<html><body><h1>Select "Option B"</h1><select id="select"><option value="">Choose...</option><option value="a">Option A</option><option value="b">Option B</option><option value="c">Option C</option></select></body></html>',
        goal: 'Select "Option B" from the dropdown',
        maxSteps: 5,
        timeout: 10_000,
        initialState: { selected: "" },
      }),
      teardown: async () => {},
      validate: (result) => result.finalState["selected"] === "b",
      reward: (result) => (result.success ? 1.0 : 0.0),
    };
  }

  /**
   * Login Form task - fill and submit a login form.
   */
  static loginForm(): TaskEnvironment {
    return {
      id: "miniwob-login-form",
      name: "Login Form",
      suite: "miniwob",
      description: "Fill in username/password and submit the login form",
      setup: async () => ({
        url: 'data:text/html,<html><body><form id="login"><h1>Login</h1><input id="username" type="text" placeholder="Username"><input id="password" type="password" placeholder="Password"><button type="submit">Login</button></form></body></html>',
        goal: 'Fill username "admin" and password "secret", then click Login',
        maxSteps: 10,
        timeout: 15_000,
        initialState: { username: "", password: "", submitted: false },
      }),
      teardown: async () => {},
      validate: (result) => {
        const s = result.finalState;
        return s["username"] === "admin" && s["password"] === "secret" && s["submitted"] === true;
      },
      reward: (result) => (result.success ? 1.0 : 0.3),
    };
  }

  /**
   * Checkbox task - check multiple checkboxes.
   */
  static checkboxTask(): TaskEnvironment {
    return {
      id: "miniwob-checkbox",
      name: "Check Checkboxes",
      suite: "miniwob",
      description: "Check the specified checkboxes",
      setup: async () => ({
        url: 'data:text/html,<html><body><h1>Check "Red" and "Blue"</h1><label><input type="checkbox" id="red" value="red"> Red</label><label><input type="checkbox" id="green" value="green"> Green</label><label><input type="checkbox" id="blue" value="blue"> Blue</label></body></html>',
        goal: "Check the Red and Blue checkboxes",
        maxSteps: 5,
        timeout: 10_000,
        initialState: { checked: [] },
      }),
      teardown: async () => {},
      validate: (result) => {
        const checked = result.finalState["checked"] as string[];
        return checked?.includes("red") && checked?.includes("blue") && !checked?.includes("green");
      },
      reward: (result) => (result.success ? 1.0 : 0.0),
    };
  }

  /**
   * Get all MiniWoB environments.
   */
  static all(): TaskEnvironment[] {
    return [
      this.clickButton(),
      this.enterText(),
      this.selectOption(),
      this.loginForm(),
      this.checkboxTask(),
    ];
  }
}

/**
 * WebArena benchmark environments - realistic web application tasks.
 */
export class WebArenaEnvironments {
  static searchProduct(): TaskEnvironment {
    return {
      id: "webarena-search",
      name: "Search Product",
      suite: "webarena",
      description: "Search for a product in an e-commerce store",
      setup: async () => ({
        url: 'data:text/html,<html><body><input id="search" type="text" placeholder="Search products..."><button id="search-btn">Search</button><div id="results"></div></body></html>',
        goal: 'Search for "laptop" in the search box',
        maxSteps: 15,
        timeout: 30_000,
        initialState: { searched: "", resultsShown: false },
      }),
      teardown: async () => {},
      validate: (result) => result.finalState["searched"] === "laptop",
      reward: (result) => (result.success ? 1.0 : 0.0),
    };
  }

  static addToCart(): TaskEnvironment {
    return {
      id: "webarena-add-cart",
      name: "Add to Cart",
      suite: "webarena",
      description: "Add a product to the shopping cart",
      setup: async () => ({
        url: 'data:text/html,<html><body><div class="product"><h2>Laptop</h2><p>$999</p><button id="add-to-cart">Add to Cart</button></div><div id="cart-count">0</div></body></html>',
        goal: "Add the laptop to the shopping cart",
        maxSteps: 15,
        timeout: 30_000,
        initialState: { cartCount: 0 },
      }),
      teardown: async () => {},
      validate: (result) => (result.finalState["cartCount"] as number) > 0,
      reward: (result) => (result.success ? 1.0 : 0.0),
    };
  }

  static all(): TaskEnvironment[] {
    return [this.searchProduct(), this.addToCart()];
  }
}

/**
 * WorkArena benchmark environments - enterprise application tasks.
 */
export class WorkArenaEnvironments {
  static createTicket(): TaskEnvironment {
    return {
      id: "workarena-create-ticket",
      name: "Create Ticket",
      suite: "workarena",
      description: "Create a support ticket in a ticketing system",
      setup: async () => ({
        url: 'data:text/html,<html><body><form id="ticket-form"><input id="title" placeholder="Ticket title"><textarea id="description" placeholder="Description"></textarea><select id="priority"><option value="">Priority</option><option value="low">Low</option><option value="high">High</option></select><button type="submit">Create</button></form></body></html>',
        goal: 'Create a ticket with title "Bug Fix", description "Fix login issue", priority "high"',
        maxSteps: 20,
        timeout: 30_000,
        initialState: { created: false },
      }),
      teardown: async () => {},
      validate: (result) => result.finalState["created"] === true,
      reward: (result) => (result.success ? 1.0 : 0.0),
    };
  }

  static all(): TaskEnvironment[] {
    return [this.createTicket()];
  }
}

/**
 * All benchmark environments.
 */
export const ALL_BENCHMARK_ENVS: TaskEnvironment[] = [
  ...MiniWoBEnvironments.all(),
  ...WebArenaEnvironments.all(),
  ...WorkArenaEnvironments.all(),
];

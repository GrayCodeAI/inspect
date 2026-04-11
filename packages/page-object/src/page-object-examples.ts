// ──────────────────────────────────────────────────────────────────────────────
// Page Object Examples
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Schema } from "effect";
import { PageObject, PageObjectConfig, PageElement, PageActionResult } from "./page-object.js";

export class LoginForm extends Schema.Class<LoginForm>("LoginForm")({
  username: Schema.String,
  password: Schema.String,
  rememberMe: Schema.Boolean,
}) {}

export class LoginResult extends Schema.Class<LoginResult>("LoginResult")({
  success: Schema.Boolean,
  error: Schema.optional(Schema.String),
  redirectUrl: Schema.optional(Schema.String),
}) {}

export class LoginPage extends PageObject {
  constructor() {
    super(
      new PageObjectConfig({
        name: "LoginPage",
        url: "/login",
        elements: [
          new PageElement({ name: "usernameInput", selector: "#username", type: "input" }),
          new PageElement({ name: "passwordInput", selector: "#password", type: "input" }),
          new PageElement({ name: "loginButton", selector: "#login-btn", type: "button" }),
          new PageElement({ name: "errorMessage", selector: ".error-message", type: "text" }),
          new PageElement({ name: "rememberCheckbox", selector: "#remember", type: "input" }),
        ],
      }),
    );
  }

  navigate() {
    return Effect.sync(() => {
      return new PageActionResult({
        success: true,
        elementName: "page",
        action: "navigate",
        duration: 0,
        value: this.url,
      });
    }).pipe(Effect.withSpan("LoginPage.navigate"));
  }

  click(elementName: string) {
    return Effect.sync(() => {
      const element = this.getElement(elementName);
      if (!element) {
        throw new Error(`Element not found: ${elementName}`);
      }
      return new PageActionResult({
        success: true,
        elementName,
        action: "click",
        duration: 0,
      });
    }).pipe(Effect.withSpan("LoginPage.click"));
  }

  fill(elementName: string, value: string) {
    return Effect.sync(() => {
      const element = this.getElement(elementName);
      if (!element) {
        throw new Error(`Element not found: ${elementName}`);
      }
      return new PageActionResult({
        success: true,
        elementName,
        action: "fill",
        duration: 0,
        value,
      });
    }).pipe(Effect.withSpan("LoginPage.fill"));
  }

  login(form: LoginForm) {
    return Effect.gen(function* () {
      yield* this.fill("usernameInput", form.username);
      yield* this.fill("passwordInput", form.password);

      if (form.rememberMe) {
        yield* this.click("rememberCheckbox");
      }

      yield* this.click("loginButton");

      const isVisible = yield* this.isVisible("errorMessage");
      if (isVisible) {
        const errorText = yield* this.getText("errorMessage");
        return new LoginResult({
          success: false,
          error: errorText,
        });
      }

      return new LoginResult({
        success: true,
        redirectUrl: "/dashboard",
      });
    }.bind(this)).pipe(Effect.withSpan("LoginPage.login"));
  }

  getText(elementName: string) {
    return Effect.sync(() => `[text:${elementName}]`).pipe(
      Effect.withSpan("LoginPage.getText"),
    );
  }

  isVisible(elementName: string) {
    return Effect.sync(() => elementName === "errorMessage").pipe(
      Effect.withSpan("LoginPage.isVisible"),
    );
  }
}

export class DashboardStats extends Schema.Class<DashboardStats>("DashboardStats")({
  totalUsers: Schema.Number,
  activeSessions: Schema.Number,
  revenue: Schema.Number,
  pendingTasks: Schema.Number,
}) {}

export class DashboardPage extends PageObject {
  constructor() {
    super(
      new PageObjectConfig({
        name: "DashboardPage",
        url: "/dashboard",
        elements: [
          new PageElement({ name: "welcomeText", selector: ".welcome-text", type: "text" }),
          new PageElement({ name: "statsPanel", selector: "#stats-panel", type: "container" }),
          new PageElement({ name: "userCount", selector: "#user-count", type: "text" }),
          new PageElement({ name: "revenueChart", selector: "#revenue-chart", type: "image" }),
          new PageElement({ name: "taskList", selector: "#task-list", type: "container" }),
          new PageElement({ name: "logoutBtn", selector: "#logout", type: "button" }),
        ],
      }),
    );
  }

  navigate() {
    return Effect.sync(() => {
      return new PageActionResult({
        success: true,
        elementName: "page",
        action: "navigate",
        duration: 0,
        value: this.url,
      });
    }).pipe(Effect.withSpan("DashboardPage.navigate"));
  }

  click(elementName: string) {
    return Effect.sync(() => {
      const element = this.getElement(elementName);
      if (!element) {
        throw new Error(`Element not found: ${elementName}`);
      }
      return new PageActionResult({
        success: true,
        elementName,
        action: "click",
        duration: 0,
      });
    }).pipe(Effect.withSpan("DashboardPage.click"));
  }

  fill(elementName: string, value: string) {
    return Effect.sync(() => {
      const element = this.getElement(elementName);
      if (!element) {
        throw new Error(`Element not found: ${elementName}`);
      }
      return new PageActionResult({
        success: true,
        elementName,
        action: "fill",
        duration: 0,
        value,
      });
    }).pipe(Effect.withSpan("DashboardPage.fill"));
  }

  getStats() {
    return Effect.gen(function* () {
      yield* Effect.logDebug("Fetching dashboard stats");

      return new DashboardStats({
        totalUsers: 1234,
        activeSessions: 56,
        revenue: 98765,
        pendingTasks: 12,
      });
    }).pipe(Effect.withSpan("DashboardPage.getStats"));
  }

  logout() {
    return Effect.gen(function* () {
      yield* this.click("logoutBtn");
      return new PageActionResult({
        success: true,
        elementName: "logoutBtn",
        action: "click",
        duration: 0,
        value: "/login",
      });
    }.bind(this)).pipe(Effect.withSpan("DashboardPage.logout"));
  }

  getText(elementName: string) {
    return Effect.sync(() => `[text:${elementName}]`).pipe(
      Effect.withSpan("DashboardPage.getText"),
    );
  }

  isVisible(elementName: string) {
    return Effect.sync(() => true).pipe(Effect.withSpan("DashboardPage.isVisible"));
  }
}

import type { PluginHook, PluginManifest } from "./plugin-types";

interface BuiltinPlugin {
  manifest: PluginManifest;
  handlers: Record<string, (...args: unknown[]) => unknown>;
}

const reporterHooks: PluginHook[] = [
  { name: "afterTest", priority: 100, handler: "afterTestHandler" },
];

export const reporterPlugin: BuiltinPlugin = {
  manifest: {
    name: "reporter",
    version: "1.0.0",
    description: "Generates test reports after test execution",
    author: "inspect",
    hooks: reporterHooks,
    dependencies: {},
    inspectVersion: "0.1.0",
  },
  handlers: {
    afterTestHandler: (context: unknown) => {
      void context;
      return Promise.resolve();
    },
  },
};

const retryHooks: PluginHook[] = [{ name: "onError", priority: 1, handler: "onErrorHandler" }];

export const retryPlugin: BuiltinPlugin = {
  manifest: {
    name: "retry",
    version: "1.0.0",
    description: "Implements retry logic for failed steps",
    author: "inspect",
    hooks: retryHooks,
    dependencies: {},
    inspectVersion: "0.1.0",
  },
  handlers: {
    onErrorHandler: (context: unknown) => {
      void context;
      return Promise.resolve();
    },
  },
};

const screenshotHooks: PluginHook[] = [
  { name: "afterStep", priority: 50, handler: "afterStepHandler" },
  { name: "onNavigation", priority: 50, handler: "onNavigationHandler" },
];

export const screenshotPlugin: BuiltinPlugin = {
  manifest: {
    name: "screenshot",
    version: "1.0.0",
    description: "Captures screenshots after steps and navigation",
    author: "inspect",
    hooks: screenshotHooks,
    dependencies: {},
    inspectVersion: "0.1.0",
  },
  handlers: {
    afterStepHandler: (context: unknown) => {
      void context;
      return Promise.resolve();
    },
    onNavigationHandler: (context: unknown) => {
      void context;
      return Promise.resolve();
    },
  },
};

const logHooks: PluginHook[] = [
  { name: "beforeTest", priority: 1000, handler: "beforeTestHandler" },
  { name: "afterTest", priority: 1000, handler: "afterTestHandler" },
  { name: "beforeStep", priority: 1000, handler: "beforeStepHandler" },
  { name: "afterStep", priority: 1000, handler: "afterStepHandler" },
  { name: "onError", priority: 1000, handler: "onErrorHandler" },
  { name: "onAssertion", priority: 1000, handler: "onAssertionHandler" },
  { name: "onNavigation", priority: 1000, handler: "onNavigationHandler" },
  { name: "onScreenshot", priority: 1000, handler: "onScreenshotHandler" },
];

export const logPlugin: BuiltinPlugin = {
  manifest: {
    name: "logger",
    version: "1.0.0",
    description: "Logs all events to file for debugging",
    author: "inspect",
    hooks: logHooks,
    dependencies: {},
    inspectVersion: "0.1.0",
  },
  handlers: {
    beforeTestHandler: (context: unknown) => {
      void context;
      return Promise.resolve();
    },
    afterTestHandler: (context: unknown) => {
      void context;
      return Promise.resolve();
    },
    beforeStepHandler: (context: unknown) => {
      void context;
      return Promise.resolve();
    },
    afterStepHandler: (context: unknown) => {
      void context;
      return Promise.resolve();
    },
    onErrorHandler: (context: unknown) => {
      void context;
      return Promise.resolve();
    },
    onAssertionHandler: (context: unknown) => {
      void context;
      return Promise.resolve();
    },
    onNavigationHandler: (context: unknown) => {
      void context;
      return Promise.resolve();
    },
    onScreenshotHandler: (context: unknown) => {
      void context;
      return Promise.resolve();
    },
  },
};

export const BUILTIN_PLUGINS: BuiltinPlugin[] = [
  reporterPlugin,
  retryPlugin,
  screenshotPlugin,
  logPlugin,
];

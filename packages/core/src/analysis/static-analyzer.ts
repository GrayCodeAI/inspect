// Static Analysis — import graph, route detection, form detection
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, extname, relative } from "node:path";

export interface RouteInfo {
  path: string;
  file: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "ALL";
  isDynamic: boolean;
}

export interface FormInfo {
  file: string;
  action?: string;
  method: string;
  fields: Array<{ name: string; type: string; required: boolean }>;
}

export interface ApiCallInfo {
  file: string;
  url: string;
  method: string;
  line: number;
  component?: string;
}

export interface EventHandlerInfo {
  file: string;
  event: string;
  element: string;
  handler: string;
  line: number;
}

export interface StaticAnalysisResult {
  routes: RouteInfo[];
  forms: FormInfo[];
  apiCalls: ApiCallInfo[];
  eventHandlers: EventHandlerInfo[];
  importGraph: Map<string, string[]>;
  deadRoutes: string[];
}

export class StaticAnalyzer {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  analyze(): StaticAnalysisResult {
    const routes = this.detectRoutes();
    const forms = this.detectForms();
    const apiCalls = this.extractApiCalls();
    const eventHandlers = this.extractEventHandlers();
    const importGraph = this.buildImportGraph();

    return {
      routes,
      forms,
      apiCalls,
      eventHandlers,
      importGraph,
      deadRoutes: [],
    };
  }

  detectRoutes(): RouteInfo[] {
    const routes: RouteInfo[] = [];
    const patterns = [
      { dir: "app", ext: [".tsx", ".ts", ".jsx", ".js"], type: "next-app" },
      { dir: "pages", ext: [".tsx", ".ts", ".jsx", ".js"], type: "next-pages" },
      { dir: "src/routes", ext: [".tsx", ".ts", ".jsx", ".js"], type: "file-based" },
      { dir: "src/pages", ext: [".tsx", ".ts", ".jsx", ".js"], type: "file-based" },
    ];

    for (const pattern of patterns) {
      const dir = join(this.rootDir, pattern.dir);
      if (!existsSync(dir)) continue;
      this.scanForRoutes(dir, dir, routes, pattern.type);
    }

    // Detect Express/Hono/Fastify routes in source files
    this.scanForApiRoutes(routes);

    return routes;
  }

  private scanForRoutes(dir: string, baseDir: string, routes: RouteInfo[], type: string): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".git") continue;
          this.scanForRoutes(fullPath, baseDir, routes, type);
        } else {
          const ext = extname(entry.name);
          if (![".tsx", ".ts", ".jsx", ".js"].includes(ext)) continue;

          const isPageFile =
            entry.name === "page.tsx" ||
            entry.name === "page.ts" ||
            entry.name === "page.jsx" ||
            entry.name === "page.js" ||
            entry.name === "index.tsx" ||
            entry.name === "index.ts";

          if (isPageFile) {
            const relPath = relative(baseDir, dir);
            const routePath = "/" + relPath.replace(/\[([^\]]+)\]/g, ":$1").replace(/\\/g, "/");
            routes.push({
              path: routePath === "/." ? "/" : routePath,
              file: relative(this.rootDir, fullPath),
              method: "GET",
              isDynamic: relPath.includes("["),
            });
          }

          // Detect API routes
          if (entry.name.startsWith("route.")) {
            const relPath = relative(baseDir, dir);
            const routePath = "/" + relPath.replace(/\[([^\]]+)\]/g, ":$1").replace(/\\/g, "/");
            const content = readFileSync(fullPath, "utf-8");
            const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
            for (const method of methods) {
              if (
                content.includes(`export async function ${method}`) ||
                content.includes(`export function ${method}`)
              ) {
                routes.push({
                  path: routePath === "/." ? "/" : routePath,
                  file: relative(this.rootDir, fullPath),
                  method,
                  isDynamic: relPath.includes("["),
                });
              }
            }
          }
        }
      }
    } catch {
      /* skip */
    }
  }

  private scanForApiRoutes(routes: RouteInfo[]): void {
    this.scanDirectoryForPatterns(this.rootDir, (content, filePath) => {
      const appRouteRegex =
        /(?:app|router|server)\.(get|post|put|delete|patch|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
      let match;
      while ((match = appRouteRegex.exec(content)) !== null) {
        routes.push({
          path: match[2],
          file: relative(this.rootDir, filePath),
          method: match[1].toUpperCase() as RouteInfo["method"],
          isDynamic: match[2].includes(":"),
        });
      }
    });
  }

  detectForms(): FormInfo[] {
    const forms: FormInfo[] = [];
    this.scanDirectoryForPatterns(this.rootDir, (content, filePath) => {
      const formRegex = /<form[^>]*>/gi;
      let match;
      while ((match = formRegex.exec(content)) !== null) {
        const formTag = match[0];
        const actionMatch = formTag.match(/action\s*=\s*['"`]([^'"`]*)['"`]/i);
        const methodMatch = formTag.match(/method\s*=\s*['"`]([^'"`]*)['"`]/i);
        const fields = this.extractFormFields(content, match.index);
        forms.push({
          file: relative(this.rootDir, filePath),
          action: actionMatch?.[1],
          method: methodMatch?.[1]?.toUpperCase() ?? "GET",
          fields,
        });
      }
    });
    return forms;
  }

  private extractFormFields(content: string, formStartIndex: number): FormInfo["fields"] {
    const fields: FormInfo["fields"] = [];
    const formEnd = content.indexOf("</form>", formStartIndex);
    if (formEnd === -1) return fields;
    const formContent = content.slice(formStartIndex, formEnd);
    const inputRegex =
      /<(input|select|textarea)[^>]*(?:name\s*=\s*['"`]([^'"`]*)['"`])?[^>]*(?:type\s*=\s*['"`]([^'"`]*)['"`])?[^>]*(?:required)?[^>]*>/gi;
    let match;
    while ((match = inputRegex.exec(formContent)) !== null) {
      if (match[2]) {
        fields.push({
          name: match[2],
          type: match[3] ?? match[1].toLowerCase(),
          required: match[0].includes("required"),
        });
      }
    }
    return fields;
  }

  extractApiCalls(): ApiCallInfo[] {
    const calls: ApiCallInfo[] = [];
    this.scanDirectoryForPatterns(this.rootDir, (content, filePath) => {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fetchMatch = line.match(/fetch\s*\(\s*['"`]([^'"`]+)['"`]/);
        if (fetchMatch) {
          calls.push({
            file: relative(this.rootDir, filePath),
            url: fetchMatch[1],
            method: "GET",
            line: i + 1,
          });
        }
        const methodMatch = line.match(
          /(?:axios|http)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/i,
        );
        if (methodMatch) {
          calls.push({
            file: relative(this.rootDir, filePath),
            url: methodMatch[2],
            method: methodMatch[1].toUpperCase(),
            line: i + 1,
          });
        }
      }
    });
    return calls;
  }

  extractEventHandlers(): EventHandlerInfo[] {
    const handlers: EventHandlerInfo[] = [];
    this.scanDirectoryForPatterns(this.rootDir, (content, filePath) => {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(
          /on(Click|Submit|Change|KeyDown|KeyUp|Focus|Blur|MouseEnter|MouseLeave)\s*[={]/,
        );
        if (match) {
          handlers.push({
            file: relative(this.rootDir, filePath),
            event: match[1].toLowerCase(),
            element: "unknown",
            handler: "inline",
            line: i + 1,
          });
        }
      }
    });
    return handlers;
  }

  private buildImportGraph(): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    this.scanDirectoryForPatterns(this.rootDir, (content, filePath) => {
      const imports: string[] = [];
      const importRegex = /(?:import|export)\s+(?:[^'";\n]*from\s+)?['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        if (match[1].startsWith(".") || match[1].startsWith("/")) {
          imports.push(match[1]);
        }
      }
      graph.set(relative(this.rootDir, filePath), imports);
    });
    return graph;
  }

  private scanDirectoryForPatterns(
    dir: string,
    callback: (content: string, filePath: string) => void,
  ): void {
    if (!existsSync(dir)) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (["node_modules", ".git", "dist", "build", ".next"].includes(entry.name)) continue;
          this.scanDirectoryForPatterns(fullPath, callback);
        } else if (
          [".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte"].includes(extname(entry.name))
        ) {
          try {
            const content = readFileSync(fullPath, "utf-8");
            callback(content, fullPath);
          } catch {
            /* skip */
          }
        }
      }
    } catch {
      /* skip */
    }
  }
}

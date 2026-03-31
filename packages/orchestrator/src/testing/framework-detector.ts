// Framework Detection — auto-detect project framework from package.json
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface DetectedFramework {
  name: string;
  defaultPort: number;
  devCommand: string;
  buildCommand: string;
  customPort?: number;
}

const FRAMEWORKS: Record<string, { name: string; defaultPort: number; deps: string[] }> = {
  next: { name: "next", defaultPort: 3000, deps: ["next"] },
  vite: { name: "vite", defaultPort: 5173, deps: ["vite"] },
  nuxt: { name: "nuxt", defaultPort: 3000, deps: ["nuxt"] },
  sveltekit: { name: "sveltekit", defaultPort: 5173, deps: ["@sveltejs/kit"] },
  remix: { name: "remix", defaultPort: 3000, deps: ["@remix-run/react"] },
  astro: { name: "astro", defaultPort: 4321, deps: ["astro"] },
  angular: { name: "angular", defaultPort: 4200, deps: ["@angular/core"] },
  gatsby: { name: "gatsby", defaultPort: 8000, deps: ["gatsby"] },
  cra: { name: "cra", defaultPort: 3000, deps: ["react-scripts"] },
  vue: { name: "vue", defaultPort: 5173, deps: ["vue"] },
  solid: { name: "solid", defaultPort: 3000, deps: ["solid-js"] },
  qwik: { name: "qwik", defaultPort: 5173, deps: ["@builder.io/qwik"] },
};

export function detectFramework(projectRoot?: string): DetectedFramework | null {
  const root = projectRoot ?? process.cwd();
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const depNames = Object.keys(allDeps);

    for (const [, framework] of Object.entries(FRAMEWORKS)) {
      if (framework.deps.some((d) => depNames.includes(d))) {
        const customPort = detectCustomPort(root, framework.name);
        return {
          name: framework.name,
          defaultPort: framework.defaultPort,
          customPort,
          devCommand: `${framework.name === "cra" ? "react-scripts" : framework.name} dev`,
          buildCommand: `${framework.name === "cra" ? "react-scripts" : framework.name} build`,
        };
      }
    }
  } catch {
    /* parse error */
  }

  return null;
}

function detectCustomPort(_root: string, _framework: string): number | undefined {
  const envFiles = [".env", ".env.local", ".env.development"];
  for (const file of envFiles) {
    try {
      const content = readFileSync(file, "utf-8");
      const match = content.match(/^PORT=(\d+)/m);
      if (match) return parseInt(match[1], 10);
    } catch {
      /* file not found */
    }
  }
  return undefined;
}

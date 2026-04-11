import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const buildConfig = {
  entryPoints: ["src/background.ts", "src/content.ts", "src/popup.ts"],
  bundle: true,
  outdir: "dist/src",
  format: "esm" as const,
  target: "chrome120" as const,
  minify: !isWatch,
  sourcemap: isWatch ? "inline" : false,
};

if (isWatch) {
  const ctx = await esbuild.context(buildConfig);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildConfig);
  console.log("Build complete");
}

// Copy static assets
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

function copyStatic() {
  const srcDir = "src";
  const distDir = "dist/src";

  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }

  // Copy popup.html
  copyFileSync(join(srcDir, "popup.html"), join(distDir, "popup.html"));

  // Copy manifest.json to dist root
  copyFileSync("manifest.json", "dist/manifest.json");
}

copyStatic();

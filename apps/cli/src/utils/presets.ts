export interface Preset {
  name: string;
  description: string;
  options: Record<string, unknown>;
}

export const PRESETS: Record<string, Preset> = {
  ci: {
    name: "CI",
    description: "Optimized for CI/CD pipelines",
    options: {
      headed: false,
      reporter: "junit",
      json: false,
      retries: 1,
      browser: "chromium",
      mode: "dom",
      devices: "desktop-chrome",
    },
  },
  mobile: {
    name: "Mobile",
    description: "Test on common mobile devices",
    options: {
      devices: "iphone-15,pixel-8,galaxy-s24",
      mode: "hybrid",
    },
  },
  desktop: {
    name: "Desktop",
    description: "Test on desktop browsers",
    options: {
      devices: "desktop-chrome,desktop-firefox",
      mode: "hybrid",
    },
  },
  comprehensive: {
    name: "Comprehensive",
    description: "Full test suite with all quality checks",
    options: {
      devices: "desktop-chrome,iphone-15",
      a11y: true,
      lighthouse: true,
      mode: "hybrid",
      retries: 2,
    },
  },
  quick: {
    name: "Quick",
    description: "Fast single-device test",
    options: {
      devices: "desktop-chrome",
      mode: "dom",
      browser: "chromium",
    },
  },
  debug: {
    name: "Debug",
    description: "Headed browser with verbose output",
    options: {
      headed: true,
      verbose: true,
      mode: "hybrid",
      devices: "desktop-chrome",
    },
  },
};

/**
 * Apply a preset's options, with CLI flags taking precedence.
 */
export function applyPreset(
  presetName: string,
  cliOptions: Record<string, unknown>,
): Record<string, unknown> {
  const preset = PRESETS[presetName];
  if (!preset) return cliOptions;

  const merged = { ...preset.options };
  // CLI options override preset
  for (const [key, value] of Object.entries(cliOptions)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * List all available presets with descriptions.
 */
export function listPresets(): string {
  const lines: string[] = ["Available presets:\n"];
  for (const [key, preset] of Object.entries(PRESETS)) {
    lines.push(`  ${key.padEnd(16)} ${preset.description}`);
    const opts = Object.entries(preset.options)
      .map(([k, v]) => `--${k}=${v}`)
      .join(" ");
    lines.push(`  ${"".padEnd(16)} ${opts}`);
    lines.push("");
  }
  return lines.join("\n");
}

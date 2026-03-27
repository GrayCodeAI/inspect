import { createInterface } from "node:readline";

export interface PickerOption {
  label: string;
  value: string;
  description?: string;
}

/**
 * Interactive arrow-key picker for terminal selection.
 * Returns the selected value, or null if cancelled.
 */
export async function pick(
  prompt: string,
  options: PickerOption[],
): Promise<string | null> {
  if (!process.stdin.isTTY) {
    // Non-interactive — return first option
    return options[0]?.value ?? null;
  }

  let selectedIndex = 0;

  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    // Enable raw mode for keypress detection
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const render = () => {
      // Clear previous output
      process.stdout.write(`\x1b[${options.length + 2}A\x1b[J`);

      process.stdout.write(`\x1b[1m${prompt}\x1b[0m\n`);
      process.stdout.write(`\x1b[2m(↑↓ to select, Enter to confirm, Esc to cancel)\x1b[0m\n`);

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const selected = i === selectedIndex;
        const prefix = selected ? "\x1b[36m❯\x1b[0m" : " ";
        const label = selected ? `\x1b[1m${opt.label}\x1b[0m` : `\x1b[2m${opt.label}\x1b[0m`;
        const desc = opt.description ? ` \x1b[2m— ${opt.description}\x1b[0m` : "";
        process.stdout.write(`  ${prefix} ${label}${desc}\n`);
      }
    };

    // Initial render — write blank lines first so clear works
    process.stdout.write(`${prompt}\n`);
    process.stdout.write("(↑↓ to select, Enter to confirm, Esc to cancel)\n");
    for (const opt of options) {
      process.stdout.write(`    ${opt.label}\n`);
    }
    render();

    const onKeypress = (data: Buffer) => {
      const key = data.toString();

      if (key === "\x1b[A") { // Up arrow
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
        render();
      } else if (key === "\x1b[B") { // Down arrow
        selectedIndex = (selectedIndex + 1) % options.length;
        render();
      } else if (key === "\r" || key === "\n") { // Enter
        cleanup();
        resolve(options[selectedIndex].value);
      } else if (key === "\x1b" || key === "\x03") { // Escape or Ctrl+C
        cleanup();
        resolve(null);
      }
    };

    const cleanup = () => {
      process.stdin.removeListener("data", onKeypress);
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
      rl.close();
    };

    process.stdin.on("data", onKeypress);
  });
}

/**
 * Multi-select picker — select multiple options with Space, confirm with Enter.
 */
export async function pickMany(
  prompt: string,
  options: PickerOption[],
): Promise<string[]> {
  if (!process.stdin.isTTY) {
    return options.map(o => o.value);
  }

  let selectedIndex = 0;
  const selected = new Set<number>();

  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const render = () => {
      process.stdout.write(`\x1b[${options.length + 2}A\x1b[J`);

      process.stdout.write(`\x1b[1m${prompt}\x1b[0m\n`);
      process.stdout.write(`\x1b[2m(↑↓ move, Space toggle, Enter confirm, Esc cancel)\x1b[0m\n`);

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const cursor = i === selectedIndex ? "\x1b[36m❯\x1b[0m" : " ";
        const check = selected.has(i) ? "\x1b[32m✓\x1b[0m" : "○";
        const label = selected.has(i) ? `\x1b[1m${opt.label}\x1b[0m` : opt.label;
        process.stdout.write(`  ${cursor} ${check} ${label}\n`);
      }
    };

    // Initial render
    process.stdout.write(`${prompt}\n`);
    process.stdout.write("(↑↓ move, Space toggle, Enter confirm)\n");
    for (const _opt of options) {
      process.stdout.write("  \n");
    }
    render();

    const onKeypress = (data: Buffer) => {
      const key = data.toString();

      if (key === "\x1b[A") {
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
        render();
      } else if (key === "\x1b[B") {
        selectedIndex = (selectedIndex + 1) % options.length;
        render();
      } else if (key === " ") {
        if (selected.has(selectedIndex)) selected.delete(selectedIndex);
        else selected.add(selectedIndex);
        render();
      } else if (key === "\r" || key === "\n") {
        cleanup();
        resolve([...selected].map(i => options[i].value));
      } else if (key === "\x1b" || key === "\x03") {
        cleanup();
        resolve([]);
      }
    };

    const cleanup = () => {
      process.stdin.removeListener("data", onKeypress);
      if (process.stdin.setRawMode) process.stdin.setRawMode(false);
      rl.close();
    };

    process.stdin.on("data", onKeypress);
  });
}

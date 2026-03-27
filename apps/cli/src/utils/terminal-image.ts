import { readFileSync } from "node:fs";

/**
 * Detect if the current terminal supports inline images.
 * Supports: iTerm2, Kitty, WezTerm, Mintty, Sixel-capable terminals.
 */
export function supportsInlineImages(): { supported: boolean; protocol: "iterm" | "kitty" | "sixel" | "none" } {
  const term = process.env.TERM_PROGRAM ?? "";
  const termEnv = process.env.TERM ?? "";

  // iTerm2
  if (term === "iTerm.app" || process.env.ITERM_SESSION_ID) {
    return { supported: true, protocol: "iterm" };
  }

  // Kitty
  if (term === "kitty" || process.env.KITTY_PID) {
    return { supported: true, protocol: "kitty" };
  }

  // WezTerm (supports iTerm2 protocol)
  if (term === "WezTerm" || process.env.WEZTERM_PANE) {
    return { supported: true, protocol: "iterm" };
  }

  // Mintty (supports sixel)
  if (process.env.TERM_PROGRAM === "mintty") {
    return { supported: true, protocol: "sixel" };
  }

  // VS Code terminal (limited support)
  if (term === "vscode") {
    return { supported: false, protocol: "none" };
  }

  return { supported: false, protocol: "none" };
}

/**
 * Render an image inline in the terminal.
 * Returns the escape sequence string, or null if not supported.
 *
 * @param imageData - Base64-encoded image data or file path
 * @param options - Display options
 */
export function renderInlineImage(
  imageData: string | Buffer,
  options?: {
    width?: number | "auto";
    height?: number | "auto";
    preserveAspectRatio?: boolean;
    name?: string;
  },
): string | null {
  const { supported, protocol } = supportsInlineImages();
  if (!supported) return null;

  let base64Data: string;
  if (Buffer.isBuffer(imageData)) {
    base64Data = imageData.toString("base64");
  } else if (imageData.startsWith("/") || imageData.includes(".")) {
    // File path
    try {
      base64Data = readFileSync(imageData).toString("base64");
    } catch {
      return null;
    }
  } else {
    base64Data = imageData;
  }

  switch (protocol) {
    case "iterm":
      return renderITerm2(base64Data, options);
    case "kitty":
      return renderKitty(base64Data, options);
    default:
      return null;
  }
}

/**
 * iTerm2 inline image protocol.
 * Also works in WezTerm, Hyper, and other iTerm2-compatible terminals.
 */
function renderITerm2(
  base64Data: string,
  options?: { width?: number | "auto"; height?: number | "auto"; name?: string; preserveAspectRatio?: boolean },
): string {
  const params: string[] = [];
  params.push(`inline=1`);

  if (options?.width && options.width !== "auto") {
    params.push(`width=${options.width}`);
  }
  if (options?.height && options.height !== "auto") {
    params.push(`height=${options.height}`);
  }
  if (options?.name) {
    params.push(`name=${Buffer.from(options.name).toString("base64")}`);
  }
  if (options?.preserveAspectRatio !== false) {
    params.push(`preserveAspectRatio=1`);
  }

  const paramStr = params.join(";");

  // ESC ] 1337 ; File=[params] : [base64data] BEL
  return `\x1b]1337;File=${paramStr}:${base64Data}\x07`;
}

/**
 * Kitty graphics protocol.
 */
function renderKitty(
  base64Data: string,
  options?: { width?: number | "auto"; height?: number | "auto" },
): string {
  // Kitty uses chunked transfer for large images
  const chunkSize = 4096;
  const chunks: string[] = [];

  for (let i = 0; i < base64Data.length; i += chunkSize) {
    const chunk = base64Data.slice(i, i + chunkSize);
    const isLast = i + chunkSize >= base64Data.length;
    const more = isLast ? 0 : 1;

    if (i === 0) {
      // First chunk includes the header
      const params = [`a=T`, `f=100`, `m=${more}`];
      if (options?.width && options.width !== "auto") {
        params.push(`c=${options.width}`);
      }
      if (options?.height && options.height !== "auto") {
        params.push(`r=${options.height}`);
      }
      chunks.push(`\x1b_G${params.join(",")};${chunk}\x1b\\`);
    } else {
      chunks.push(`\x1b_Gm=${more};${chunk}\x1b\\`);
    }
  }

  return chunks.join("");
}

/**
 * Print a screenshot to the terminal if inline images are supported,
 * otherwise print the file path.
 */
export function printScreenshot(filePath: string, label?: string): void {
  const image = renderInlineImage(filePath, {
    width: 80,
    preserveAspectRatio: true,
    name: label,
  });

  if (image) {
    process.stdout.write(image + "\n");
    if (label) {
      process.stdout.write(`  ${label}\n`);
    }
  } else {
    process.stdout.write(`  Screenshot: ${filePath}\n`);
  }
}

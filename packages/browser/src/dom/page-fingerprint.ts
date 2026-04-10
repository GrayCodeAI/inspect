// ============================================================================
// @inspect/browser - Page Fingerprint
// ============================================================================
// SHA256-based page fingerprinting for stagnation detection
// Inspired by browser-use's PageFingerprint

import { createHash } from "node:crypto";
import type { Page } from "playwright";

export interface PageFingerprint {
  hash: string;
  elementCount: number;
  textContent: string;
  timestamp: number;
  url: string;
}

const TEXTtruncATION_MAX = 5000;

/**
 * Generate a stable fingerprint of the current page state.
 * Uses DOM text content + element count for detection of stagnation.
 */
export async function generatePageFingerprint(page: Page): Promise<PageFingerprint> {
  const url = page.url();
  const timestamp = Date.now();

  const elementCount = await page.locator("*").count();

  const textContent = await page
    .evaluate(() => {
      const body = document.body;
      if (!body) return "";
      return body.innerText?.slice(0, 5000) ?? "";
    })
    .catch(() => "");

  const hash = createHash("sha256")
    .update(textContent)
    .update(elementCount.toString())
    .digest("hex");

  return {
    hash,
    elementCount,
    textContent: textContent.slice(0, TEXTtruncATION_MAX),
    timestamp,
    url,
  };
}

/**
 * Check if page has changed significantly since last fingerprint.
 * Returns true if page appears stagnant (not changed).
 */
export function isPageStagnant(
  current: PageFingerprint,
  previous: PageFingerprint,
  threshold = 0.95,
): boolean {
  if (current.url !== previous.url) return false;

  if (current.elementCount !== previous.elementCount) return false;

  const currentText = current.textContent;
  const previousText = previous.textContent;

  const shorter = Math.min(currentText.length, previousText.length);
  if (shorter === 0) return currentText === previousText;

  let matching = 0;
  for (let i = 0; i < shorter; i++) {
    if (currentText[i] === previousText[i]) matching++;
  }

  return matching / shorter >= threshold;
}

/**
 * Track page fingerprints over time and detect stagnation.
 */
export class PageFingerprintTracker {
  private fingerprints: PageFingerprint[] = [];
  private readonly maxHistory: number;

  constructor(maxHistory = 10) {
    this.maxHistory = maxHistory;
  }

  add(fingerprint: PageFingerprint): void {
    this.fingerprints.push(fingerprint);
    if (this.fingerprints.length > this.maxHistory) {
      this.fingerprints.shift();
    }
  }

  getLatest(): PageFingerprint | undefined {
    return this.fingerprints[this.fingerprints.length - 1];
  }

  getPrevious(): PageFingerprint | undefined {
    return this.fingerprints.length >= 2
      ? this.fingerprints[this.fingerprints.length - 2]
      : undefined;
  }

  checkStagnation(): boolean {
    if (this.fingerprints.length < 2) return false;

    const current = this.fingerprints[this.fingerprints.length - 1];
    const previous = this.fingerprints[this.fingerprints.length - 2];

    return isPageStagnant(current, previous);
  }

  getConsecutiveStagnantCount(): number {
    let count = 0;
    for (let i = this.fingerprints.length - 1; i > 0; i--) {
      if (isPageStagnant(this.fingerprints[i], this.fingerprints[i - 1])) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  clear(): void {
    this.fingerprints = [];
  }

  get history(): readonly PageFingerprint[] {
    return this.fingerprints;
  }
}

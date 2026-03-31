import { execSync } from "node:child_process";
import { Effect, Layer, ServiceMap } from "effect";
import type { Browser, BrowserKey, ChromiumBrowser, FirefoxBrowser, SafariBrowser } from "./types.js";
import { BROWSER_CONFIGS } from "./browser-config.js";

const WHICH_COMMAND = process.platform === "win32" ? "where" : "/usr/bin/which";

const isCommandAvailable = (command: string): boolean => {
  try {
    execSync(`${WHICH_COMMAND} ${command}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

const getProfilePath = (dataDir: string, profileDir: string): string => {
  return profileDir ? `${dataDir}/${profileDir}` : dataDir;
};

export class Browsers extends ServiceMap.Service<Browsers>()("@inspect/Browsers", {
  make: Effect.succeed({
    listAvailable: (): Browser[] => {
      const browsers: Browser[] = [];
      const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
      const configDir = process.platform === "darwin"
        ? `${home}/Library/Application Support`
        : process.platform === "win32"
          ? process.env.LOCALAPPDATA ?? ""
          : `${home}/.config`;

      for (const [key, config] of Object.entries(BROWSER_CONFIGS)) {
        if (!isCommandAvailable(key)) continue;

        if (key === "safari" || key === "safari-technology-preview") {
          browsers.push({
            _tag: "SafariBrowser",
            key: key as SafariBrowser["key"],
            cookieFilePath: config.cookieFile ? `${home}/Library/Cookies/${config.cookieFile}` : null,
          } as SafariBrowser);
        } else if (key === "firefox" || key === "firefox-developer" || key === "firefox-nightly") {
          const profilePath = getProfilePath(`${configDir}/${config.dataDir}`, config.profileDir);
          browsers.push({
            _tag: "FirefoxBrowser",
            key: key as FirefoxBrowser["key"],
            profilePath,
          } as FirefoxBrowser);
        } else {
          const profilePath = getProfilePath(`${configDir}/${config.dataDir}`, config.profileDir);
          browsers.push({
            _tag: "ChromiumBrowser",
            key: key as ChromiumBrowser["key"],
            profilePath,
            executablePath: key,
          } as ChromiumBrowser);
        }
      }
      return browsers;
    },
    getDefaultBrowser: (): BrowserKey | null => {
      try {
        const result = execSync("default-browser", { stdio: "pipe", encoding: "utf-8" });
        return result.trim() as BrowserKey;
      } catch {
        return null;
      }
    },
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

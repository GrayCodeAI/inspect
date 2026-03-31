export type FirefoxPlatform = "linux" | "darwin" | "win32";
export type FirefoxSource = {
  readonly platform: FirefoxPlatform;
  readonly profilesIni: string;
};

export const getFirefoxSource = (platform: FirefoxPlatform): FirefoxSource => {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const sources: Record<FirefoxPlatform, FirefoxSource> = {
    linux: { platform: "linux", profilesIni: `${home}/.mozilla/firefox/profiles.ini` },
    darwin: { platform: "darwin", profilesIni: `${home}/Library/Application Support/Firefox/profiles.ini` },
    win32: { platform: "win32", profilesIni: `${home}\\AppData\\Roaming\\Mozilla\\Firefox\\profiles.ini` },
  };
  return sources[platform];
};

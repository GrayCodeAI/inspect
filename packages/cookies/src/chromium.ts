export type ChromiumPlatform = "linux" | "darwin" | "win32";
export type ChromiumSource = {
  readonly platform: ChromiumPlatform;
  readonly dataDir: string;
  readonly stateFile?: string;
};

export const getChromiumSource = (platform: ChromiumPlatform): ChromiumSource => {
  const sources: Record<ChromiumPlatform, ChromiumSource> = {
    linux: { platform: "linux", dataDir: process.env.HOME ? `${process.env.HOME}/.config` : "" },
    darwin: { platform: "darwin", dataDir: process.env.HOME ? `${process.env.HOME}/Library/Application Support` : "" },
    win32: { platform: "win32", dataDir: process.env.LOCALAPPDATA ?? "" },
  };
  return sources[platform];
};

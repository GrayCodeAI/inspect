export type SafariPlatform = "darwin";
export type SafariSource = {
  readonly platform: SafariPlatform;
  readonly cookieFile: string;
};

export const getSafariSource = (): SafariSource => {
  const home = process.env.HOME ?? "";
  return {
    platform: "darwin",
    cookieFile: `${home}/Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies`,
  };
};

export interface StealthOptions {
  enabled: boolean;
}

export const getStealthOptions = (): StealthOptions => ({
  enabled: true,
});

export const getStealthLaunchArgs = (): string[] => [
  "--disable-blink-features=AutomationControlled",
  "--disable-dev-shm-usage",
  "--no-sandbox",
];

export const stealthInitScript = `Object.defineProperty(navigator, 'webdriver', { get: () => undefined });`;

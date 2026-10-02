export type AppTheme = "light" | "halloween";

export const THEME_STORE_KEY = "chitrader.load-tracker.theme.v1";

export function readAppTheme(): AppTheme {
  return "light";
}

export function applyAppTheme(_theme: AppTheme = "light") {
  delete document.documentElement.dataset.theme;
  try {
    localStorage.removeItem(THEME_STORE_KEY);
  } catch {
    /* private mode / blocked storage */
  }
}

export function writeAppTheme(_theme: AppTheme = "light") {
  applyAppTheme("light");
}

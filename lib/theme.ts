import { THEMES, type ThemePref } from "./types";

/** Cookie that mirrors the theme choice so the server can render the right theme first time (no flash). */
export const THEME_COOKIE = "calm_theme";

export const parseTheme = (v: unknown): ThemePref => (THEMES.includes(v as ThemePref) ? (v as ThemePref) : "system");

/** Value for <html data-theme>. "system" renders no attribute, so CSS follows prefers-color-scheme. */
export const themeAttr = (t: ThemePref) => (t === "system" ? undefined : t);

import { THEMES, type ThemePref } from "./types";

export const THEME_COOKIE = "calm_theme";

export const parseTheme = (v: unknown): ThemePref => (THEMES.includes(v as ThemePref) ? (v as ThemePref) : "system");

export const themeAttr = (t: ThemePref) => (t === "system" ? undefined : t);

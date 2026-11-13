// The chat's accent and ground, as colour overrides in the app's settings.json,
// so the whole window follows.

import { appHome, readTextFile, writeTextFile } from "herdr";
import { mix } from "./ui.js";

// Graphite replaces the theme's ground; Black is the theme's own.
const GRAPHITE = {
  canvas: "#0B0C0F",
  chrome: "#0E1014",
  background: "#111318",
  surface: "#1A1D24",
  popover: "#1A1D24",
  raised: "#20242C",
  hover: "#20242C",
  selected: "#1A1D24",
  border: "#252932",
  input: "#333946",
  foreground: "#E7E9EE",
  muted: "#8B91A1",
  dim: "#5E6472",
};
const OURS = [...Object.keys(GRAPHITE), "accent", "accent_foreground"];

// Ink that reads on the accent: nearly black on a light accent, nearly white on a dark one.
function inkOn(accent) {
  const light = [1, 3, 5].reduce((sum, at) => sum + parseInt(accent.slice(at, at + 2), 16), 0) > 380;
  return mix(accent, light ? "#000000" : "#ffffff", 0.92).toUpperCase();
}

/**
 * Writes the look into settings.json; other settings and colours stay.
 * @param {import("./model/settings.js").ChatSettings} look
 */
export async function applyLook(look) {
  const path = `${appHome()}/settings.json`;
  const text = await readTextFile(path);
  const settings = text ? JSON.parse(text) : {};
  const colors = { ...(settings.colors || {}) };
  for (const name of OURS) delete colors[name];
  if (look.ground === "graphite") Object.assign(colors, GRAPHITE);
  colors.accent = look.accent;
  colors.accent_foreground = inkOn(look.accent);
  settings.colors = colors;
  const next = `${JSON.stringify(settings, null, 2)}\n`;
  if (next !== text) await writeTextFile(path, next, text);
}

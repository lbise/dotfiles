// The chat's own settings: what they may be, and what they are when unset.

/**
 * @typedef {object} ChatSettings
 * @property {string} accent "#RRGGBB", upper case.
 * @property {"black"|"graphite"} ground
 * @property {"cells"|"text"} activity How a turn's tool activity is drawn.
 * @property {680|760|900} width Reading width in pixels.
 */

export const ACCENTS = [
  { name: "Chalk", color: "#EDEDED" },
  { name: "Lime", color: "#C5F25C" },
  { name: "Jade", color: "#64D6A5" },
  { name: "Ice", color: "#8FE3F2" },
  { name: "Tangerine", color: "#FF8A3D" },
];
export const GROUNDS = ["black", "graphite"];
export const ACTIVITIES = ["cells", "text"];
export const WIDTHS = [680, 760, 900];

/** @type {ChatSettings} */
export const DEFAULT_SETTINGS = { accent: ACCENTS[0].color, ground: "black", activity: "cells", width: 760 };

/**
 * A preset's name or any #rrggbb, as "#RRGGBB"; null when it is neither.
 * @param {unknown} value
 * @returns {string|null}
 */
export function parseAccent(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toUpperCase();
  const preset = ACCENTS.find((accent) => accent.name.toLowerCase() === text.toLowerCase());
  return preset ? preset.color : null;
}

/**
 * Valid settings from whatever was stored: each field that is missing or not
 * allowed takes its default.
 * @param {any} stored
 * @returns {ChatSettings}
 */
export function chatSettings(stored) {
  const given = stored && typeof stored === "object" ? stored : {};
  return {
    accent: parseAccent(given.accent) || DEFAULT_SETTINGS.accent,
    ground: GROUNDS.includes(given.ground) ? given.ground : DEFAULT_SETTINGS.ground,
    activity: ACTIVITIES.includes(given.activity) ? given.activity : DEFAULT_SETTINGS.activity,
    width: WIDTHS.includes(given.width) ? given.width : DEFAULT_SETTINGS.width,
  };
}

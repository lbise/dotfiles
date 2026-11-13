import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCENTS, DEFAULT_SETTINGS, chatSettings, parseAccent } from "./settings.js";

test("defaults", () => {
  assert.deepEqual(DEFAULT_SETTINGS, { accent: "#EDEDED", ground: "black", activity: "cells", width: 760 });
  assert.deepEqual(chatSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(chatSettings("nonsense"), DEFAULT_SETTINGS);
});

test("the five presets", () => {
  assert.deepEqual(
    ACCENTS.map((accent) => `${accent.name} ${accent.color}`),
    ["Chalk #EDEDED", "Lime #C5F25C", "Jade #64D6A5", "Ice #8FE3F2", "Tangerine #FF8A3D"]
  );
});

test("accent is a preset or any #rrggbb", () => {
  assert.equal(parseAccent("lime"), "#C5F25C");
  assert.equal(parseAccent("#12ab9f"), "#12AB9F");
  for (const bad of ["#fff", "red", "#12ab9g", "", 5, null]) assert.equal(parseAccent(bad), null);
});

test("valid fields are kept, the others fall back", () => {
  assert.deepEqual(chatSettings({ accent: "#64d6a5", ground: "graphite", activity: "text", width: 900 }), {
    accent: "#64D6A5",
    ground: "graphite",
    activity: "text",
    width: 900,
  });
  assert.deepEqual(chatSettings({ accent: "pink", ground: "white", activity: "", width: 700, extra: 1 }), DEFAULT_SETTINGS);
  assert.equal(chatSettings({ width: "900" }).width, 760);
});

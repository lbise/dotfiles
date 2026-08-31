import assert from "node:assert/strict";
import test from "node:test";

import { initTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

import {
  AnsiLine,
  OutputPreview,
  ToolCallDisplay,
  shortenPath,
} from "../render.ts";

initTheme("dark", false);

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

function assertFits(lines: string[], width: number): void {
  for (const line of lines) {
    assert.ok(
      visibleWidth(line) <= Math.max(0, width),
      `${JSON.stringify(line)} is wider than ${width}`,
    );
  }
}

test("AnsiLine clamps ANSI text at every terminal width", () => {
  const line = new AnsiLine("a long tool heading that cannot wrap");
  for (const width of [0, 1, 2, 5, 12, 80]) assertFits(line.render(width), width);
});

test("tool headers and output use one accent vertical rule", () => {
  const accentTheme = {
    fg: (color: string, text: string) => color === "accent" ? `[accent]${text}` : text,
    bold: (text: string) => text,
  } as Theme;
  const call = new ToolCallDisplay();
  call.update("read", "file.ts", "", "running", accentTheme);
  const preview = new OutputPreview({ lines: ["content"], expanded: false }, accentTheme);

  assert.equal(call.render(80).join("\n"), "[accent]│ read [accent]file.ts");
  assert.equal(preview.render(80).join("\n"), "[accent]│ content");
  assert.doesNotMatch(call.render(80).join("\n"), /[○●✓✗]/);
});

test("collapsed previews show the requested first lines and an expansion hint", () => {
  const preview = new OutputPreview({
    lines: ["one", "two", "three", "four"],
    expanded: false,
    collapsedLines: 2,
  }, theme);

  const rendered = preview.render(80);
  assert.deepEqual(rendered.slice(0, 2), ["│ one", "│ two"]);
  assert.match(rendered.at(-1) ?? "", /2 more lines/);
  assert.match(rendered.at(-1) ?? "", /expand/);
});

test("delta backgrounds extend to the current render width", () => {
  const colored = "\u001b[48;2;32;48;59m+added\u001b[0m";
  const preview = new OutputPreview({
    lines: [colored, "plain context"],
    expanded: false,
    fillBackgroundLines: true,
  }, theme);

  const [added = "", context = ""] = preview.render(24);
  assert.equal(visibleWidth(added), 24);
  assert.match(added, /\+added +\u001b\[0m$/);
  assert.equal(visibleWidth(context), "│ plain context".length);
});

test("shell previews keep the tail when collapsed", () => {
  const preview = new OutputPreview({
    lines: ["old", "middle", "latest"],
    expanded: false,
    collapsedLines: 2,
    collapsedFrom: "end",
  }, theme);

  const rendered = preview.render(80).join("\n");
  assert.doesNotMatch(rendered, /│ old/);
  assert.match(rendered, /│ middle/);
  assert.match(rendered, /│ latest/);
  assert.match(rendered, /1 earlier lines/);
});

test("expanded previews wrap content, cap height, and always fit", () => {
  const preview = new OutputPreview({
    lines: ["abcdefghij", "second", "third"],
    expanded: true,
    expandedLines: 2,
  }, theme);

  const rendered = preview.render(30);
  assertFits(rendered, 30);
  assert.match(rendered.join("\n"), /capped/);
  assert.doesNotMatch(rendered.join("\n"), /third/);

  preview.invalidate();
  assertFits(preview.render(6), 6);
});

test("ANSI and OSC-styled previews still obey narrow widths", () => {
  const styled = "\u001b[38;2;122;162;247mcolored text that is too long\u001b[0m";
  const link = "\u001b]8;;https://example.com\u0007linked output\u001b]8;;\u0007";
  const preview = new OutputPreview({
    lines: [styled, link],
    expanded: false,
    collapsedLines: 2,
  }, theme);

  for (const width of [1, 2, 3, 8, 16]) {
    preview.invalidate();
    assertFits(preview.render(width), width);
  }
});

test("shortenPath makes paths relative to the working directory", () => {
  assert.equal(shortenPath("/work/project/file.ts", "/work/project"), "file.ts");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { blocks } from "./fences.js";

test("fenced blocks", () => {
  assert.deepEqual(blocks("a\n```js\nx = 1\n```\nb"), [
    { code: false, text: "a" },
    { code: true, text: "x = 1", info: "js" },
    { code: false, text: "b" },
  ]);
  // Inside a list item: indented fences close, and the indent leaves the code.
  assert.deepEqual(blocks("- item:\n\n  ```cpp\n  return x;\n    y;\n  ```\n\n  more\n- next"), [
    { code: false, text: "- item:" },
    { code: true, text: "return x;\n  y;", info: "cpp" },
    { code: false, text: "more\n- next" },
  ]);
  // A fence with text after it does not close the block.
  assert.deepEqual(blocks("```md\n```js\n```"), [{ code: true, text: "```js", info: "md" }]);
  // Still being written: runs to the end.
  assert.deepEqual(blocks("a\n```\nx"), [
    { code: false, text: "a" },
    { code: true, text: "x", info: "" },
  ]);
});

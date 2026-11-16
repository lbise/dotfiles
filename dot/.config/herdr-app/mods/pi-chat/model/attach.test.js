import assert from "node:assert/strict";
import { test } from "node:test";
import { promptWith, shownName } from "./attach.js";

test("shownName drops the staging stamp", () => {
  assert.equal(shownName("data/pi-chat-uploads/20250101-120000-123-0-shot.png"), "shot.png");
  assert.equal(shownName("plain.txt"), "plain.txt");
});

test("promptWith sends images as pictures and other files as paths", () => {
  assert.deepEqual(promptWith("hi", []), { type: "prompt", text: "hi" });
  assert.deepEqual(promptWith("", ["/t/a.PNG"]), { type: "prompt", text: "", images: ["/t/a.PNG"] });
  assert.deepEqual(promptWith("look", ["/t/a.jpg", "/t/b.pdf"]), {
    type: "prompt",
    text: "look\n\nAttached files:\n- /t/b.pdf",
    images: ["/t/a.jpg"],
  });
  assert.deepEqual(promptWith("", ["/t/b.log"]), { type: "prompt", text: "Attached files:\n- /t/b.log" });
});

# Pi `/comment` extension — research note

## What it does

The [gist source](https://gist.githubusercontent.com/badlogic/563f245975444dbeedd1a93de95a5e92/raw) is a small Pi extension, not a model-powered review tool. Its `/comment` command:

1. Requires `ctx.hasUI` (interactive UI).
2. Scans `ctx.sessionManager.getBranch()` from the end and selects the first assistant message it encounters. It requires `stopReason === "stop"`; otherwise it reports that no completed assistant message was found. It joins that message's text blocks.
3. Prefixes every line with `> `, writes the result to a temporary `.md` file in the OS temporary directory, and runs `$VISUAL` or `$EDITOR` on it.
4. Removes one trailing newline, loads the edited text with `ctx.ui.setEditorText()`, and does **not** submit it.

Thus it does **not** call a model, append session entries, alter old messages, or create a persistent annotation. The user may edit the quoted text and then decide what to submit as a normal Pi input. The branch lookup follows Pi's session-tree branch API rather than parsing JSONL directly ([`docs/session-format.md`](file:///home/13lbise/.nvm/versions/node/v24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/session-format.md)); editor loading is a supported UI operation described by the extension examples ([`examples/extensions/qna.ts`](file:///home/13lbise/.nvm/versions/node/v24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/qna.ts)).

## Runtime compatibility

The gist imports `@mariozechner/pi-coding-agent` and `@mariozechner/pi-ai`. In installed Pi `0.84.1`, the extension loader explicitly aliases both old names to the bundled current packages in **both** its virtual-module table and its jiti aliases ([`dist/core/extensions/loader.js`](file:///home/13lbise/.nvm/versions/node/v24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js)). Therefore those old imports work when the gist is loaded by this Pi extension runtime; this does not imply that arbitrary standalone Node execution resolves them.

The extension API documents `ctx.hasUI`, commands, and `ctx.ui` ([`docs/extensions.md`](file:///home/13lbise/.nvm/versions/node/v24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md), “Available Imports”, “ExtensionContext”, and “Custom UI”). The TUI component contract is relevant only to extensions that build custom components; this gist uses the existing editor and external process instead ([`docs/tui.md`](file:///home/13lbise/.nvm/versions/node/v24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/tui.md)).

## Limitations and security

- It is interactive-only in practice: without UI it exits with an error. It also requires `$VISUAL` or `$EDITOR`; editor failures are reported and the temporary file is cleaned up on the normal path.
- The editor command is split on spaces, so quoted/complex editor commands are not parsed robustly. The selected editor is executable with the Pi process's permissions, and the extension itself is trusted code with those permissions ([`docs/extensions.md`](file:///home/13lbise/.nvm/versions/node/v24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md), security warning).
- The assistant text is copied to a temporary file and displayed to the configured editor. It may contain secrets or untrusted text; review the content and editor configuration before use. The gist does not send the text to a provider or persist it by itself.
- It only considers the first assistant entry found while walking backward. An incomplete latest assistant entry therefore prevents using an earlier completed one; an assistant response with no text is also rejected. It quotes text mechanically and does not parse Markdown or preserve a separate original.

## Sources

- [Exact gist source](https://gist.githubusercontent.com/badlogic/563f245975444dbeedd1a93de95a5e92/raw) (primary implementation source).
- [`docs/extensions.md`](file:///home/13lbise/.nvm/versions/node/v24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md) (extension API, UI, security).
- [`docs/session-format.md`](file:///home/13lbise/.nvm/versions/node/v24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/session-format.md) (branch/session model).
- [`docs/tui.md`](file:///home/13lbise/.nvm/versions/node/v24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/tui.md) and [`examples/extensions/qna.ts`](file:///home/13lbise/.nvm/versions/node/v24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/qna.ts) (installed UI/editor APIs).
- [`dist/core/extensions/loader.js`](file:///home/13lbise/.nvm/versions/node/v24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js) (runtime compatibility aliases).

// The read-only code views of the answers' code blocks, coloured by the
// highlighter with the theme's terminal colours. A view's state can only be made
// outside a draw: a block drawn before its view exists asks for one, and shows
// plain until `make` runs (from the next read or tick). Signs keep apart as
// typed (no ligatures); the copy button copies the code itself.

import { EditorState } from "gpui-base";
import { theme } from "herdr";
import { asCode, codeFont } from "./ui.js";

const KEPT = 160;
const LANGUAGES = { ts: "js", tsx: "js", typescript: "js", javascript: "js", jsx: "js", mjs: "js", cjs: "js", sh: "bash", shell: "bash", zsh: "bash", console: "bash", py: "python", yml: "yaml", jsonc: "json", toml: "yaml", h: "c", hpp: "cpp", "c++": "cpp" };

function syntax(t) {
  return { keyword: t.ansi5, string: t.ansi2, "string.escape": t.ansi6, comment: t.muted, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6, boolean: t.ansi1 };
}

export class CodeViews {
  constructor() {
    this.views = new Map(); // id -> { state, code, language, wrap, colours }
    this.wanted = new Map(); // id -> { code, language, wrap }: drawn without a view
  }

  /**
   * The view for a block, or null when there is none yet (then it is made on the next `make`).
   * @param {boolean} [wrap] Long lines wrap (prose) instead of scrolling sideways.
   */
  view(id, code, info, wrap = false) {
    const language = LANGUAGES[info] || info || "text";
    const view = this.views.get(id);
    if (view && view.language === language && view.wrap === wrap && view.colours === theme().ansi4) {
      if (view.code !== code) this.wanted.set(id, { code, language, wrap });
      // Kept in the order last drawn: the views not drawn for longest go first.
      this.views.delete(id);
      this.views.set(id, view);
      return view.state;
    }
    this.wanted.set(id, { code, language, wrap });
    return null;
  }

  /** Makes or updates the views drawn since the last call. True when one changed. */
  make() {
    if (!this.wanted.size) return false;
    const t = theme();
    for (const [id, { code, language, wrap }] of this.wanted) {
      const view = this.views.get(id);
      if (view && view.language === language && view.wrap === wrap && view.colours === t.ansi4) {
        view.state.set_value(asCode(code));
        view.code = code;
        continue;
      }
      if (view) view.state.release();
      this.views.delete(id);
      const state = EditorState.new({ language, value: asCode(code), readonly: true, line_numbers: false, folding: false, soft_wrap: wrap, font_family: codeFont(), font_size: 12.5, syntax: syntax(t) });
      this.views.set(id, { state, code, language, wrap, colours: t.ansi4 });
    }
    this.wanted.clear();
    for (const [id, view] of [...this.views].slice(0, Math.max(0, this.views.size - KEPT))) {
      view.state.release();
      this.views.delete(id);
    }
    return true;
  }
}

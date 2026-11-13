// Keys a text field would take for itself. A field binds Enter, the arrows and
// Tab to its own actions, which run before any `on_key_down` around it hears
// them. A binding of ours, on a context wrapped right around the field (whose
// own context is "Input"), matches as deep and is newer, so it comes first.
//   PiChatField: the reply box. Enter sends instead of breaking the line
//     (Shift+Enter still does). Pi's own keys, as in its terminal: Ctrl+P and
//     Alt+P (Pi's Shift+Ctrl+P on Windows; Herdr's palette keeps that) cycle the
//     models, Shift+Tab the thinking levels. Ctrl+G edits the text in Neovim (editor.js).
//   PiChatMenu: a field with a list over it (the slash menu, the pickers):
//     ↑↓ move, Tab and Enter pick, Esc closes.
//   Both: Ctrl+A selects all the text (the field's own binding moves to the line start).

// shortcut: Pi's default keys, not read from Pi's keybindings.json; read them once someone remaps them.
const CONTEXTS = { PiChatField: ["enter", "ctrl-p", "alt-p", "shift-tab", "ctrl-a", "ctrl-g", "f9"], PiChatMenu: ["up", "down", "tab", "enter", "escape", "ctrl-a"] };

const action = (key) => `pi_chat_key_${key.replace(/-/g, "_")}`;

/** Installs the bindings. They are app-wide: a reload adds them again, which does no harm. */
export function bindKeys(cx) {
  cx.bind_keys(Object.entries(CONTEXTS).flatMap(([context, keys]) => keys.map((key) => ({ keystroke: key, action: action(key), context: `${context} > Input` }))));
}

/**
 * Selects all of a text field's text, and redraws so the selection shows.
 * @param {{ value(): string, set_selected_range(range: { start: number, end: number }): void }} state
 */
export function selectAll(state, cx) {
  state.set_selected_range({ start: 0, end: state.value().length });
  cx.notify();
}

/**
 * Makes `el`, the direct wrapper of a text field, take its context's keys.
 * @param {boolean} menu A list is open over the field.
 * @param {(key: string, cx: object) => void} handle
 */
export function takeKeys(el, menu, handle) {
  const context = menu ? "PiChatMenu" : "PiChatField";
  let keyed = el.key_context(context);
  for (const key of CONTEXTS[context]) keyed = keyed.on_action(action(key), (_event, cx) => handle(key, cx));
  return keyed;
}

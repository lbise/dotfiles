// Keys a text field would take for itself. A field binds Enter, the arrows and
// Tab to its own actions, which run before any `on_key_down` around it hears
// them. A binding of ours, on a context wrapped right around the field (whose
// own context is "Input"), matches as deep and is newer, so it comes first.
//   PiChatField: the reply box. Enter sends instead of breaking the line
//     (Shift+Enter still does).
//   PiChatMenu: a field with a list over it (the slash menu, the pickers):
//     ↑↓ move, Tab and Enter pick, Esc closes.

const CONTEXTS = { PiChatField: ["enter"], PiChatMenu: ["up", "down", "tab", "enter", "escape"] };

/** Installs the bindings. They are app-wide: a reload adds them again, which does no harm. */
export function bindKeys(cx) {
  cx.bind_keys(Object.entries(CONTEXTS).flatMap(([context, keys]) => keys.map((key) => ({ keystroke: key, action: `pi_chat_key_${key}`, context: `${context} > Input` }))));
}

/**
 * Makes `el`, the direct wrapper of a text field, take its context's keys.
 * @param {boolean} menu A list is open over the field.
 * @param {(key: string, cx: object) => void} handle
 */
export function takeKeys(el, menu, handle) {
  const context = menu ? "PiChatMenu" : "PiChatField";
  let keyed = el.key_context(context);
  for (const key of CONTEXTS[context]) keyed = keyed.on_action(`pi_chat_key_${key}`, (_event, cx) => handle(key, cx));
  return keyed;
}

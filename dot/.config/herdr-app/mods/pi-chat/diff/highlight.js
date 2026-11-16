// Syntax highlighting for diff rows, with Prism (prism.js, built by
// scripts/herdr-app-build-prism). Each side of a diff is tokenized as one text,
// so a comment or string that spans lines is coloured on every line it covers;
// unchanged lines take the new side's colours. A gap (lines left out) starts
// over: a hunk that begins inside a comment is coloured as code.
//
// Plain JS, no Herdr imports: node runs its tests.

import Prism from "./prism.js";

/**
 * What a token is, for colours: the keys of a code view's `syntax`, plus
 * `property` (an object key, an attribute). Null: plain text.
 * @typedef {"keyword"|"string"|"string.escape"|"comment"|"function"|"type"|"number"|"constant"|"boolean"|"variable"|"operator"|"punctuation"|"property"} Kind
 *
 * @typedef {{ text: string, kind: Kind|null }} Span
 */

// Prism's token types (and aliases), as kinds. A type not here takes its parent's kind.
const KINDS = {
  comment: "comment", prolog: "comment", doctype: "comment", cdata: "comment", shebang: "comment",
  keyword: "keyword", important: "keyword", atrule: "keyword", rule: "keyword", tag: "keyword", directive: "keyword", "directive-hash": "keyword", title: "keyword", "control-flow": "keyword",
  string: "string", char: "string", "template-string": "string", "attr-value": "string", url: "string", regex: "string", code: "string", "code-snippet": "string",
  escape: "string.escape", entity: "string.escape",
  function: "function", "function-name": "function", method: "function", "macro-name": "function",
  "class-name": "type", builtin: "type", type: "type", "maybe-class-name": "type", selector: "type", namespace: "type",
  number: "number",
  boolean: "boolean",
  constant: "constant", symbol: "constant", variable: "constant", annotation: "constant", decorator: "constant",
  operator: "operator",
  punctuation: "punctuation",
  property: "property", "attr-name": "property", key: "property",
};

// File names and extensions Prism names otherwise.
const NAMES = { makefile: "makefile", gnumakefile: "makefile", "cmakelists.txt": "cmake", dockerfile: "docker", ".gitignore": "ignore", ".editorconfig": "editorconfig", ".gitconfig": "ini", ".gitmodules": "ini" };
const EXTENSIONS = {
  h: "c", hh: "cpp", hpp: "cpp", hxx: "cpp", cc: "cpp", cxx: "cpp", ino: "cpp", m: "objectivec", mm: "objectivec",
  rs: "rust", zig: "zig", nim: "nim", s: "armasm", asm: "nasm", ll: "llvm", ld: "linker-script", lds: "linker-script", vert: "glsl", frag: "glsl", sv: "verilog", v: "verilog", vhd: "vhdl", cmake: "cmake", mk: "makefile", mak: "makefile", y: "bison",
  py: "python", pyi: "python", sh: "bash", bash: "bash", zsh: "bash", ksh: "bash", ps1: "powershell", psm1: "powershell", bat: "batch", cmd: "batch", pl: "perl", pm: "perl", rb: "ruby", jl: "julia",
  js: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript", mts: "typescript", cts: "typescript",
  htm: "markup", html: "markup", xml: "markup", svg: "markup", xaml: "markup", md: "markdown", markdown: "markdown", jsonc: "json", gql: "graphql",
  kt: "kotlin", kts: "kotlin", gradle: "groovy", cs: "csharp", fs: "fsharp", fsx: "fsharp",
  hs: "haskell", ml: "ocaml", mli: "ocaml", ex: "elixir", exs: "elixir", erl: "erlang", clj: "clojure", cljs: "clojure",
  yml: "yaml", conf: "ini", cfg: "ini", tf: "hcl", proto: "protobuf", tex: "latex", sty: "latex",
};

const MAX_TEXT = 400000; // characters per side: past this, plain text

/**
 * The Prism language for a file, or null when it has none.
 * @param {string} path
 */
export function languageOf(path) {
  const name = (path.split(/[\\/]/).pop() || "").toLowerCase();
  if (NAMES[name]) return NAMES[name];
  if (name.startsWith("dockerfile")) return "docker";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const extension = name.slice(dot + 1);
  const id = EXTENSIONS[extension] || extension;
  return grammarOf(id) ? id : null;
}

// Prism's grammar for a language; plain text (`txt`, `plain`) has none worth the work.
function grammarOf(language) {
  const grammar = language ? Prism.languages[language] : null;
  return grammar && Object.keys(grammar).length ? grammar : null;
}

function kindOf(token, inherited) {
  if (KINDS[token.type]) return KINDS[token.type];
  const aliases = Array.isArray(token.alias) ? token.alias : token.alias ? [token.alias] : [];
  for (const alias of aliases) if (KINDS[alias]) return KINDS[alias];
  return inherited;
}

// Prism's token stream, flat: the innermost kind wins.
function flatten(stream, inherited, out) {
  for (const token of stream) {
    if (typeof token === "string") out.push({ text: token, kind: inherited });
    else if (typeof token.content === "string") out.push({ text: token.content, kind: kindOf(token, inherited) });
    else flatten(Array.isArray(token.content) ? token.content : [token.content], kindOf(token, inherited), out);
  }
  return out;
}

/**
 * Lines of `text`, each as spans; null when the language is unknown or tokenizing fails.
 * @param {string[]} lines
 * @param {string} language
 * @returns {Span[][]|null}
 */
export function highlightLines(lines, language) {
  if (!lines.length) return [];
  const grammar = grammarOf(language);
  const text = lines.join("\n");
  if (!grammar || text.length > MAX_TEXT) return null;
  let spans;
  try {
    spans = flatten(Prism.tokenize(text, grammar), null, []);
  } catch {
    return null;
  }
  const out = [[]];
  for (const span of spans) {
    const parts = span.text.split("\n");
    parts.forEach((part, index) => {
      if (index) out.push([]);
      if (!part) return;
      const line = out[out.length - 1];
      const last = line[line.length - 1];
      // Neighbours of one kind are one span: fewer elements to draw.
      if (last && last.kind === span.kind) last.text += part;
      else line.push({ text: part, kind: span.kind });
    });
  }
  return out.length === lines.length ? out : null;
}

/**
 * Spans for each row of a diff; null when the language is unknown.
 * @param {Array<{ kind: "add"|"del"|"same"|"gap", text: string }>} rows
 * @param {string|null} language A Prism language (languageOf).
 * @returns {Span[][]|null} One entry per row; a gap's is empty.
 */
export function highlightRows(rows, language) {
  if (!grammarOf(language)) return null;
  const out = new Array(rows.length);
  let start = 0;
  for (let end = 0; end <= rows.length; end++) {
    if (end < rows.length && rows[end].kind !== "gap") continue;
    // One run of rows between gaps: each side tokenized whole.
    const before = [], after = [];
    for (let i = start; i < end; i++) {
      if (rows[i].kind !== "add") before.push(i);
      if (rows[i].kind !== "del") after.push(i);
    }
    const old = highlightLines(before.map((i) => rows[i].text), language);
    const now = highlightLines(after.map((i) => rows[i].text), language);
    if (!old || !now) return null;
    before.forEach((row, index) => (out[row] = old[index]));
    after.forEach((row, index) => (out[row] = now[index]));
    if (end < rows.length) out[end] = [];
    start = end + 1;
  }
  return out;
}

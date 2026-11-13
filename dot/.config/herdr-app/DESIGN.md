---
name: Herdr app (Leo)
description: "Visual system for the Herdr desktop window and its Pi chat mod: a black ground, neutral greys, one chalk accent, and coloured cells for what an agent did"
colors:
  black-ground: "#000000"
  surface-grey: "#161616"
  raised-grey: "#1C1C1C"
  rule-grey: "#232323"
  input-grey: "#333333"
  chalk-text: "#EDEDED"
  muted-grey: "#8F8F8F"
  dim-grey: "#5C5C5C"
  chalk-accent: "#EDEDED"
  accent-ink: "#000000"
  well-black: "#0B0B0B"
  used-cell: "#CCCCCC"
  empty-cell-rule: "#2B2B2B"
  reply-rule: "#7E7E7E"
  cell-look-blue: "#7AA2F7"
  cell-run-violet: "#BB9AF7"
  cell-edit-amber: "#E0AF68"
  cell-failed-rose: "#F7768E"
  added-green: "#9ECE6A"
typography:
  prose:
    fontFamily: "Geist"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  message:
    fontFamily: "Geist"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  question:
    fontFamily: "Geist"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.5
  title:
    fontFamily: "Geist"
    fontSize: "13px"
    fontWeight: 600
  ui:
    fontFamily: "Geist"
    fontSize: "13px"
    fontWeight: 400
  control:
    fontFamily: "Geist"
    fontSize: "12.5px"
    fontWeight: 400
  label:
    fontFamily: "Geist"
    fontSize: "12px"
    fontWeight: 400
  badge:
    fontFamily: "Geist"
    fontSize: "11px"
    fontWeight: 500
  figure:
    fontFamily: "Geist Mono"
    fontSize: "12px"
    fontWeight: 400
  code:
    fontFamily: "JetBrainsMono Nerd Font Mono, Geist Mono"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.6
  terminal:
    fontFamily: "JetBrainsMono Nerd Font Mono"
    fontSize: "16px"
    fontWeight: 400
    fontFeature: "liga 0"
rounded:
  cell: "1.5px"
  tag: "5px"
  segment: "6px"
  control: "7px"
  track: "8px"
  option: "9px"
  frame: "10px"
  panel: "12px"
  bubble: "14px"
  round: "999px"
spacing:
  cell-gap: "2px"
  work-body: "8px"
  gap: "10px"
  inset: "14px"
  gutter: "24px"
  turn: "18px"
components:
  pane-header:
    backgroundColor: "{colors.black-ground}"
    textColor: "{colors.chalk-text}"
    typography: "{typography.ui}"
    height: "46px"
    padding: "0 14px"
  header-button:
    textColor: "{colors.muted-grey}"
    rounded: "{rounded.control}"
    size: "28px"
  header-button-on:
    backgroundColor: "{colors.surface-grey}"
    textColor: "{colors.chalk-text}"
  view-switch:
    backgroundColor: "{colors.surface-grey}"
    textColor: "{colors.muted-grey}"
    rounded: "{rounded.track}"
    padding: "2px"
  view-switch-on:
    backgroundColor: "{colors.black-ground}"
    textColor: "{colors.chalk-text}"
    rounded: "{rounded.segment}"
    height: "24px"
    padding: "0 10px"
  user-bubble:
    backgroundColor: "{colors.surface-grey}"
    textColor: "{colors.chalk-text}"
    typography: "{typography.message}"
    rounded: "{rounded.bubble}"
    padding: "10px 14px"
    width: "560px"
  step-cell:
    backgroundColor: "{colors.cell-look-blue}"
    rounded: "{rounded.cell}"
    width: "7px"
    height: "16px"
  work-line:
    textColor: "{colors.muted-grey}"
    typography: "{typography.ui}"
    height: "34px"
  code-block:
    backgroundColor: "{colors.well-black}"
    textColor: "{colors.chalk-text}"
    typography: "{typography.code}"
    rounded: "{rounded.frame}"
    padding: "12px 14px"
  files-card:
    textColor: "{colors.muted-grey}"
    typography: "{typography.ui}"
    rounded: "{rounded.frame}"
  reply-box:
    backgroundColor: "{colors.surface-grey}"
    textColor: "{colors.chalk-text}"
    typography: "{typography.message}"
    rounded: "{rounded.bubble}"
    padding: "12px 12px 10px 14px"
  send-button:
    backgroundColor: "{colors.chalk-accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.round}"
    size: "28px"
  send-button-idle:
    backgroundColor: "{colors.raised-grey}"
    textColor: "{colors.dim-grey}"
  picker-chip:
    textColor: "{colors.muted-grey}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    height: "24px"
    padding: "0 8px"
  picker-chip-open:
    backgroundColor: "{colors.raised-grey}"
    textColor: "{colors.chalk-text}"
  ask-card:
    textColor: "{colors.chalk-text}"
    rounded: "{rounded.bubble}"
    padding: "14px"
  ask-option:
    textColor: "{colors.chalk-text}"
    rounded: "{rounded.option}"
    height: "36px"
    padding: "7px 10px"
  ask-option-number-picked:
    backgroundColor: "{colors.chalk-accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.tag}"
    size: "20px"
  button-primary:
    backgroundColor: "{colors.chalk-accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.track}"
    height: "30px"
    padding: "0 12px"
  status-bar:
    textColor: "{colors.muted-grey}"
    typography: "{typography.figure}"
    height: "34px"
    padding: "0 14px"
  settings-panel:
    backgroundColor: "{colors.surface-grey}"
    textColor: "{colors.chalk-text}"
    rounded: "{rounded.panel}"
    padding: "14px"
    width: "228px"
  segmented-choice-on:
    backgroundColor: "{colors.surface-grey}"
    textColor: "{colors.chalk-text}"
    typography: "{typography.control}"
    rounded: "{rounded.segment}"
    height: "26px"
  menu:
    backgroundColor: "{colors.surface-grey}"
    textColor: "{colors.muted-grey}"
    rounded: "{rounded.frame}"
    padding: "4px"
  step-tooltip:
    backgroundColor: "{colors.surface-grey}"
    textColor: "{colors.chalk-text}"
    typography: "{typography.figure}"
    rounded: "{rounded.control}"
    padding: "5px 9px"
---

# Design System: Herdr app (Leo)

## Overview

**Creative North Star: "The channel map"**

Herdr is the Windows window from which Leo runs several Pi agents at once, on WSL and on three Linux boards. The window is a black ground with neutral greys and chalk text; nothing in its chrome carries hue. Colour is reserved for one job: showing what an agent did. Each tool call is one small cell, coloured by its kind, laid on one line the way a radio draws channels. A thirty-step turn is one line of thirty cells, and pointing at a cell names its step.

The chat comes first and the real terminal is one click away (the Chat | Terminal switch in every Pi pane's header). The reading column is centred and narrow enough to read for hours beside dark terminals; the answer is the loudest thing on screen, and the work behind it folds into a single "Worked for 1m 45s" line until it is doubted. Everything that can be pressed is chalk or turns chalk under the pointer; everything else is grey.

The sources of truth are `themes/leo.json` (colours), `settings.json` (terminal font, zoom), `layouts/leo.json` (window structure) and the `mods/pi-chat/` mod (every chat size, radius and motion). Sizes are design pixels; the window renders them at the app zoom (1.3).

**Key Characteristics:**
- Black ground, neutral greys, chalk text; no tint in the chrome.
- One accent (chalk), used only on what can be pressed or what has been picked.
- Four cell colours (blue look, violet run, amber edit, rose failed), taken from the terminal's ANSI slots.
- Geist for words, Geist Mono for figures, the terminal's font for code.
- Flat tone layering; a shadow only under things that float.
- Small, purposeful motion: cells grow in, rows rise in, step lists open.

## Colors

A colourless black-and-grey ground with chalk text and chalk controls; hue appears only in cells, and those hues are Tokyo Night's so the chat and the terminal agree.

### Primary
- **Chalk accent** (`chalk-accent`): the send and stop button, the "Open Terminal" and "Answer" buttons, a picked option in Pi's question (its border and number), and the reply box's rule (the border colour mixed 45% toward the accent, `reply-rule`). Ink on it is `accent-ink`. The accent can be changed in Chat settings (see Components); nothing else in the system moves when it does.

### Cell colours
These are the terminal's ANSI slots (`ansi4`, `ansi5`, `ansi3`, `ansi1`), not separate theme colours, so a cell's blue is the terminal's blue.
- **Look blue** (`cell-look-blue`): read, grep, find, ls, and web fetch or search.
- **Run violet** (`cell-run-violet`): bash, powershell, code mode.
- **Edit amber** (`cell-edit-amber`): edit, write.
- **Failed rose** (`cell-failed-rose`): any step that failed, whatever its kind. A step of any other kind is a dim-grey cell.

### Status ink
- **Failed rose** also marks a failure in words: a failed step's duration, "Pi stopped with an error", the notice above the reply box when a machine did not take a command, removed-line counts (−N), and an invalid hex in Chat settings.
- **Added green** (`added-green`, ANSI `ansi2`): added-line counts (+N) in the changed-files card. Nowhere else.

### Neutral
- **Black ground** (`black-ground`): the canvas, the sidebar and tab bar (`chrome`), the chat frame, every pane header, and the terminals' own background.
- **Surface grey** (`surface-grey`): user bubbles, the reply box, the switch track, the settings panel, menus, tooltips, the label pill in a running work line; also hover on step lines and ask options.
- **Raised grey** (`raised-grey`): hover and open state of picker chips and menu rows, the idle send button, the jump-to-latest button on hover.
- **Rule grey** (`rule-grey`): every border and divider: window dividers, pane borders, the header's bottom rule, the status bar's top rule, file-card rows, the scroll thumb.
- **Input grey** (`input-grey`): the focused pane's border, the ask card's border, the jump button's ring; also the terminal selection.
- **Chalk text** (`chalk-text`): primary text and icons.
- **Muted grey** (`muted-grey`): secondary text: the machine and folder, work lines, step verbs, durations, the status bar, unselected switch and segment labels.
- **Dim grey** (`dim-grey`): disabled ink (idle send, unchosen Answer) and the cell of an unknown step kind.
- **Well black** (`well-black`, black mixed halfway to surface): code blocks and opened step results.
- **Used cell** (`used-cell`) and **empty-cell rule** (`empty-cell-rule`): the status bar's context and usage cells, filled and outlined.

### Graphite ground (setting)
Chat settings offers a second ground. Choosing it writes these overrides into `settings.json`, so the whole window follows, terminals included: canvas #0B0C0F, chrome #0E1014, background #111318, surface/popover/selected #1A1D24, raised/hover #20242C, border #252932, input #333946, foreground #E7E9EE, muted #8B91A1, dim #5E6472. Black is the theme's own and removes the overrides.

### Named Rules
**The Pressable Chalk Rule.** The accent marks what can be pressed (send, stop, a primary button, the reply box) or what has been picked (an ask option). It never marks a heading, a status or a decoration. A spinner is chalk text, not accent.

**The Cells Carry the Colour Rule.** Blue, violet, amber and rose mean a step's kind. Outside a cell the only hues are rose for a failure and green for added lines; everything else is a grey.

**The Terminal Keeps Tokyo Night Rule.** The terminal ANSI palette stays Tokyo Night. The terminals take the black ground; the cells borrow the ANSI slots rather than defining their own.

## Typography

**UI and prose font:** Geist (Herdr's shell font; the mod never sets it)
**Figures font:** Geist Mono
**Code font:** JetBrainsMono Nerd Font Mono, the terminal font from `settings.json` (falls back to Geist Mono)

**Character:** a quiet grotesque for reading, a mono of the same family for anything counted, and the terminal's own face for anything that came out of a terminal. Hierarchy comes from size, weight and the muted grey, not from colour.

### Hierarchy
- **Prose** (400, 15px, 1.6): the answer's markdown, blocks 12px apart.
- **Message** (400, 15px, 1.5): user bubbles and the reply box text.
- **Question** (500, 15px, 1.5): Pi's question over its options; option labels at 14px.
- **Title** (600, 13px): "Pi" in the header, "Chat settings". The session title beside it is 13px at 500.
- **UI** (400, 13px): header row, work lines, notes, the changed-files card (its heading 500), state messages' body text. Empty and error state titles are 15px at 500.
- **Control** (400, 12.5px): picker chips, switch-style segments. The view switch uses 13px.
- **Label** (400, 12px, muted): settings section labels.
- **Badge** (500, 11px): the "Needs you" chip in a pane header.
- **Figure** (Geist Mono, 12px): step counts, durations, token and cost figures, the whole status bar, file paths, step lines, tooltips, the hex field, option numbers. The running work line's label pill is 12.5px.
- **Code** (terminal font, 12.5px, 1.6): code blocks. Step results are 12px on an 18px line, at most 12 lines.
- **Terminal** (16px, ligatures off): the terminals.

### Named Rules
**The Figures in Mono Rule.** Anything counted or timed (steps, seconds, tokens, dollars, percentages, paths) is Geist Mono so it does not jitter as it updates.

**The As Typed Rule.** Text shows what was typed: a zero-width non-joiner between sign characters stops `->` or `>=` becoming a ligature, matching the terminals' ligatures-off setting. Tabs show as four spaces.

## Layout

- **Window** (`layouts/leo.json`): no title bar; traffic lights at 12, 16. A 268px sidebar on the chrome ground (brand 46px, Spaces and Agents lists sharing the height equally, a 69px footer) and the work column (tabs 42px, the work body, a 28px status line). Dividers are 1px rule grey. A Files / Changes side panel (368px, 280 to 900px) stays hidden until asked for.
- **Work body:** 8px padding and an 8px gap. It is a stack of two children swapped in place: the chat panel and the active tab's terminal panes. The terminal keeps running under either.
- **Terminal panes:** 10px radius, 1px rule border (input grey when focused), 8px between panes, 14 × 12px terminal padding, and the mod's 46px header always shown.
- **Chat frame:** the same 10px radius and rule border, so both views read as one card. Top to bottom: the 46px header, the conversation, the dock (question card and reply box), the 34px status bar.
- **Reading column:** every row and the dock are centred at the reading width (760px by default; 680 or 900 in settings) with a 24px gutter each side. User bubbles sit right, at most 560px wide; everything else runs the column's width. Newest is at the bottom; scrolling up stops following and a 32px "Jump to latest" disc appears 10px above the dock.
- **Vertical rhythm:** 18px before a user message, 10px before a work line, 4px between a work line and its answer (12px when there was no work), 14px before the changed-files card, 14px above the reply box and 12px below it.
- **Status bar:** 14px inset, 10px between parts, a 1 × 12px rule between groups. When the pane narrows, words drop in a fixed order (labels, "of 1M", branch, reset text, usage detail); figures and cells never drop.

### Named Rules
**The One Column Rule.** The conversation, question and reply box share one centred column. The header and status bar run full width; nothing else does.

## Elevation & Depth

Flat. Depth comes from tone: black ground, a 50% well for code, surface grey for things you wrote or can type into, raised grey for hover. Only things that float over the conversation cast the platform's large shadow (`shadow_lg`): the settings panel, the model and thinking menus, a cell's tooltip and the jump-to-latest disc.

### Named Rules
**The Float Only Rule.** A shadow means "this is above the conversation and will go away". Cards in the conversation (code, files, question, reply box) are bordered or toned, never shadowed.

## Shapes

Soft rectangles, with radius growing with size: 1.5px cells, 5px tags and option numbers, 6px switch segments and menu rows, 7px icon buttons and chips, 8px tracks, 9px ask options and fields, 10px frames (panes, chat, code, files card, menus), 12px for the settings panel and 14px for bubbles, the reply box and the ask card. Round discs for the send button, accent swatches and the jump button. Borders are 1px, except a selected accent swatch's 2px chalk ring. The hover mark on a cell is a 1px chalk outline around it (2.5px radius).

## Components

### Pane header
- **Structure:** a 22px surface tile with the program's icon, "Pi" (600), the session title (500, truncates), then machine · folder in muted grey (home as `~`), then the trailing controls. 46px high, 14px inset, 10px gaps, rule below.
- **Same in both views:** the chat and every Pi terminal pane draw the same header, so switching views does not move it. Terminal panes add split right, split down, zoom and close (28px icon buttons, shown on hover) and an agent status: a 13px spinner while working, a "Needs you" chip (blocked colour at 15%), or a 7px dot when done. Non-Pi panes get a plain header: program name and folder.

### Chat | Terminal switch
- **Style:** a 2px-padded surface track (8px radius) holding two 24px segments (6px radius, 10px inset, a 15px icon and a 13px label).
- **States:** the shown view sits on a black segment in chalk text; the other is muted, turns chalk on hover, and switches on click. Choosing is remembered per session; choosing Terminal gives the terminal the keyboard.

### Header icon button
28px, 7px radius, muted icon. Hover and open: surface fill, chalk icon. Tooltip when closed. The chat's one is the sliders button that opens Chat settings.

### Step cells and the work line
- **Cell:** 7 × 16px, 1.5px radius, 2px apart, coloured by kind (see Colors). One per tool call.
- **Work line (done):** "Worked for 1m 45s", a chevron, the strip of cells, then "14 steps" in Geist Mono at the right. 34px high, muted. Clicking it opens the step list.
- **Work line (running):** a chalk spinner, the verb in chalk ("Reading", "Running", "Editing", "Thinking", "Writing"), the current label in a surface pill in Geist Mono, the strip, and the running clock at the right. While Pi waits on a question the verb is "Waiting for your answer" and there is no spinner.
- **Overflow:** when the strip outgrows the column, the oldest cells give way to a muted "+N" count.
- **Hover:** a chalk outline around the cell and a tooltip above it: "run ctest -R dmtx_proto · failed · 8s".
- **Motion:** a new cell grows from 2px to full height (160ms, ease-out); the running step's cell pulses its opacity (0.35 to 1, 1.2s).
- **Text only:** the "Tool activity: Text only" setting removes the strip; the words and counts stay.

### Step list
Opened under the work line between two rules, it opens and closes by height (180ms, ease-out). Each line is 24px in Geist Mono 12px: a 7 × 14px cell, the verb in a 44px muted column, the label in chalk, the duration in muted (rose when failed). Pi's remarks between steps sit on the same 24px lines in muted Geist. A step with output highlights on hover and opens its result below: a well-black block, 8px radius, indented 24px, in the terminal font.

### User bubble
Surface grey, 14px radius, 10 × 14px padding, message type, right-aligned, at most 560px.

### Answer
Markdown in prose type, selectable. Line breaks are kept as Pi wrote them. Code blocks: well black, 1px rule, 10px radius, 12 × 14px padding, terminal font, scroll sideways rather than wrap; a 26px copy button (surface, rule border, muted icon) appears top-right on hover and shows a check for 1.5s after copying.

### Changed files
A rule-bordered card (10px radius): a 34px heading row ("2 changed files" at 500 with total counts), then one 34px row per file (file icon, path in Geist Mono, counts), rows divided by rules. Counts are green +N and rose −N in Geist Mono.

### Reply box
- **Style:** surface grey, 14px radius, a 1px rule tinted toward the accent, 15px text growing from one to eight lines, placeholder "Reply to Pi".
- **Under the text:** the model chip (chalk) and thinking chip (muted), each 24px, 7px radius; hover or open fills raised grey. They open a menu above (popover grey, rule border, 10px radius, 4px padding, 28px rows with a check on the current one).
- **Send / stop:** a 28px chalk disc at the right with an up-arrow; idle (empty box) it is raised grey with a dim arrow. While Pi works it becomes a stop square. Hover fades it to 86%. Enter sends, Shift+Enter breaks a line, Esc stops.

### Question card
Above the reply box when Pi asks: a 14px-radius card with an input-grey border and 14px padding. The question in question type, then options as 36px rows (9px radius, rule border, surface on hover), each led by a 20px numbered tag in Geist Mono. Number keys pick. A picked option (multi-select) takes an accent border and an accent tag with a check. Under them, a 36px surface field "Or write your own answer", and for multi-select an "Answer" button (accent when something is picked, raised and dim when not).

### Status bar
34px, Geist Mono 12px, muted, rule above. Groups, separated by short rules: Context with 40 cells (6 × 13px; used chalk-grey, unused outlined) and "113k of 1M"; branch icon, repository and branch; cost; each usage limit as 10 cells and a percentage. Values are chalk at 500; words stay muted.

### Chat settings
A 228px surface panel under the sliders button (12px radius, rule border, 14px padding, large shadow). Sections, each with a 12px muted label and, where useful, its value in Geist Mono at the right:
- **Accent:** five 28px swatches (a 20px colour disc; the picked one ringed in chalk) for Chalk #EDEDED (default), Lime #C5F25C, Jade #64D6A5, Ice #8FE3F2 and Tangerine #FF8A3D, plus a hex field (Geist Mono, black, rose border if invalid). The label shows the preset's name or "Custom".
- **Ground:** Black (default) | Graphite.
- **Tool activity:** Cells (default) | Text only.
- **Reading width:** Narrow 680 | Medium 760 (default) | Wide 900.

Choices are segmented: a black 2px-padded track (8px radius) with 26px segments; the chosen one is surface with a rule border in chalk text, the others muted. Accent and ground are written into `settings.json` as colour overrides so the whole window follows; the accent's ink is derived (near black on a light accent, near white on a dark one).

### Empty and error states
Centred in the conversation, at most 440px wide: a 15px title at 500, a 13px muted line, and when there is something to do, an accent button (30px, 8px radius, 13px at 500): "Open Terminal". Used for "Nothing here yet", "No chat for this Pi" (no extension or version mismatch) and "1-wsl is not answering". A silent machine also shows a rose notice above the reply box while the last conversation stays visible.

### Conversation motion
New rows fade in and rise 6px (160ms, ease-out); rows already there when the chat opens do not animate. Spinners turn once per 900ms. The scroll thumb is a 4px rule-grey bar, 3px from the right edge.

## Do's and Don'ts

### Do:
- **Do** take every colour from the Herdr theme (`theme()`): surface, raised, border, input, muted, dim, accent and the ANSI slots. Derived colours (well, used cell, reply rule) are mixes of theme colours, not new hex values.
- **Do** give every tool call exactly one cell, coloured by its kind, and keep cells 2px apart.
- **Do** put figures in Geist Mono and anything from a terminal (code, tool output) in the terminal font.
- **Do** keep the reading column at the chosen width (680, 760 or 900) with its 24px gutter.
- **Do** make an action discoverable by turning it chalk (or surface) on hover; keep it muted at rest.
- **Do** keep the Pi header identical in the chat and the terminal view, with the Chat | Terminal switch at its right.

### Don't:
- **Don't** use the accent for status, headings, rules or decoration; it marks what can be pressed or what is picked.
- **Don't** use blue, violet or amber outside cells, or rose and green outside failures and line counts.
- **Don't** shadow anything that sits in the conversation; shadows are for things that float.
- **Don't** change the terminal's ANSI palette away from Tokyo Night; the cells depend on it.
- **Don't** let ligatures join typed signs, in the chat or the terminal.
- **Don't** drop figures or cells from the status bar when space is short; drop words first.

## Known drift

- **Cell size.** The direction contract says cells are one size everywhere. The code uses three: 7 × 16px in the work line, 7 × 14px in the opened step list, 6 × 13px in the status bar. This document records the code.
- **Colour outside cells.** The contract keeps data colours to cells. The code also uses rose for failure text, removed-line counts and the invalid hex field, and green for added-line counts. Herdr's own sidebar (outside this config) shows coloured space avatars and green status dots in every screenshot.
- **Accent ink.** The theme's `accent_foreground` is #000000. Saving the accent or ground from Chat settings writes a derived ink instead (for Chalk, about #131313). `settings.json` currently has no colour overrides, so the theme value holds.
- **Status colours.** Pane headers use the theme's `working`, `blocked` and `done` colours, which `themes/leo.json` does not set; they come from Herdr's defaults and are not recorded here.
- **Screenshots predate the code.** The review screenshots (`.impeccable/review/`) were taken before the last edits to `ask.js`, `chat-view.js`, `markdown.js`, `menu.js`, `settings-panel.js`, `states.js`, `steps.js`, `turn.js` and `ui.js`. No visible disagreement was found, but they may not show the latest details.

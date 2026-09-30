---
name: Leo desktop
description: Visual system for the Quickshell bar and the apps that sit around it (Hyprland, Walker, Mako, Ghostty)
colors:
  graphite-ground: "#1B1D24"
  graphite-surface: "#272A34"
  graphite-inset: "#20232B"
  graphite-rule: "#3B404E"
  pearl-text: "#DCDDE5"
  slate-muted: "#A0A4B5"
  jade-accent: "#64D6A5"
  signal-rose: "#F7768E"
  amber-warning: "#E0AF68"
  moss-good: "#9ECE6A"
typography:
  title:
    fontFamily: "JetBrainsMono Nerd Font"
    fontSize: "17px"
    fontWeight: 600
  body:
    fontFamily: "JetBrainsMono Nerd Font"
    fontSize: "14px"
    fontWeight: 400
    fontFeature: "tnum"
  label:
    fontFamily: "JetBrainsMono Nerd Font"
    fontSize: "12px"
    fontWeight: 400
  glyph:
    fontFamily: "JetBrainsMono Nerd Font Propo"
    fontSize: "17px"
rounded:
  control: "6px"
  base: "8px"
  row: "9px"
  bar: "11px"
  group: "11px"
  card: "14px"
  pill: "999px"
spacing:
  hairline: "1px"
  tight: "6px"
  row: "10px"
  section: "12px"
  gap: "10px"
components:
  bar:
    backgroundColor: "{colors.graphite-ground}"
    textColor: "{colors.pearl-text}"
    rounded: "{rounded.bar}"
    height: "34px"
  bar-button:
    textColor: "{colors.pearl-text}"
    rounded: "{rounded.control}"
    height: "26px"
    padding: "0 8px"
  bar-button-current:
    backgroundColor: "#64D6A524"
    textColor: "{colors.jade-accent}"
  popup-card:
    backgroundColor: "{colors.graphite-surface}"
    textColor: "{colors.pearl-text}"
    rounded: "{rounded.card}"
    padding: "6px"
  section-body:
    backgroundColor: "{colors.graphite-inset}"
    rounded: "{rounded.group}"
    padding: "12px"
  list-row:
    rounded: "{rounded.row}"
    padding: "7px 8px"
  button-pill:
    backgroundColor: "#DCDDE514"
    textColor: "{colors.pearl-text}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 14px"
  button-primary:
    backgroundColor: "{colors.jade-accent}"
    textColor: "{colors.graphite-ground}"
    rounded: "{rounded.pill}"
    height: "32px"
  button-danger:
    backgroundColor: "#F7768E26"
    textColor: "{colors.signal-rose}"
    rounded: "{rounded.pill}"
    height: "32px"
  slider-pill:
    backgroundColor: "#DCDDE514"
    textColor: "{colors.graphite-ground}"
    rounded: "{rounded.pill}"
    height: "30px"
  chip:
    backgroundColor: "#DCDDE514"
    textColor: "{colors.slate-muted}"
    rounded: "{rounded.pill}"
    padding: "3px 7px"
---

# Design System: Leo desktop

## Overview

**Creative North Star: "The quiet frame around a Tokyo Night terminal"**

The terminal is where the work happens and it keeps Ghostty's stock TokyoNight Night theme. Everything else (bar, popups, launcher, notifications, window borders) is a companion to it rather than a copy: a charcoal graphite that is slightly less blue than the terminal, pearl text with almost no tint, and one jade accent. The frame should read as calm and precise at a glance and never compete with the terminal for colour.

The system serves an operator. Popups exist to check a state or flip a setting and get out of the way, so density is moderate, controls are large enough to hit without aiming, and every value that changes over time uses tabular figures.

The source of truth is `dot/.config/leo/theme/palette.json`. Quickshell reads it live; `system-theme-apply.py` writes it into Hyprland, Walker, Mako and Ghostty. The component vocabulary lives in `dot/.config/quickshell/leo-shell/` (see Components). The prototype that settled these choices is on the branch `prototype/bar-lab`.

**Key Characteristics:**
- One accent, used only for the current or selected thing.
- Neutral rule colour for every border and divider, including window borders.
- Monospace everywhere, with Nerd Font Material Design glyphs as the only icon set.
- Depth from tone (ground, inset, surface), with one soft shadow under popups.
- Floating bar that lines up with Hyprland's window gaps.

## Colors

A near-neutral charcoal family with pearl text and a single cool-green accent; status colours are borrowed from Tokyo Night so alerts match the terminal.

### Primary
- **Jade** (#64D6A5): the current workspace, the connected network or device, the selected output, meter fills, primary buttons, switches that are on, focus rings. Nothing decorative.

### Neutral
- **Graphite ground** (#1B1D24): the bar, input fields, Mako and Walker backgrounds.
- **Graphite surface** (#272A34): popup cards; Walker's box.
- **Graphite inset** (#20232B, 45% of the way from ground to surface): the body of a section inside a card. Derived in `Theme.inset`, not stored in the palette.
- **Graphite rule** (#3B404E): the bar outline, dividers, window borders (active), Mako and Walker outlines, input borders at rest. Inactive window borders use it at 50% alpha.
- **Pearl text** (#DCDDE5): primary text and glyphs.
- **Slate muted** (#A0A4B5): secondary text, subtitles, keys in key/value rows, empty workspaces, inactive glyphs.

### Status
- **Signal rose** (#F7768E): errors, paused printers, danger buttons, the shut-down glyph, critical notifications.
- **Amber** (#E0AF68): warnings and attention (quota at 75% or more, a tray app that needs attention).
- **Moss** (#9ECE6A): positive status chips such as "Ready".

### Named Rules
**The One Accent Rule.** Jade marks where you are or what is on. It never decorates, never outlines windows and never colours a whole region.

**The Rule Colour Rule.** Any line that separates or outlines something uses the rule colour. A second border colour is not added.

**The Terminal Leads Rule.** The terminal keeps its own theme. Frame colours may echo Tokyo Night's status hues but never its violet ground.

## Typography

**Body Font:** JetBrainsMono Nerd Font (14px, weight 400)
**Glyph Font:** JetBrainsMono Nerd Font Propo (proportional glyph widths)

**Character:** one monospaced family for text and numbers keeps readings aligned and matches the terminal next to it. Hierarchy comes from size, weight and the muted colour, not from a second face.

### Hierarchy
- **Title** (600, 17px): popup titles such as "Sound" or "Wi-Fi".
- **Name** (600, 14px): the subject of a section when it is one thing ("Claude Code", "Office Laser").
- **Body** (400, 14px, tabular figures): rows, values, bar labels, the clock.
- **Label** (400 or 500, 12px, muted): subtitles, section headings, details under meters, chips.

### Named Rules
**The Tabular Rule.** Numbers that update (clock, percentages, sizes, load) use tabular figures so they do not shift.

## Layout

- The bar is a layer surface across the top edge. The visible bar floats 8px from the top and 10px from each side (Hyprland's `gaps_out`); it reserves 42px so windows sit 10px under it, the same gap as at the sides.
- Bar content: Arch menu and workspaces on the left, clock centred, status buttons on the right, one divider between the monitoring group (media, keep-awake reminder, AI usage, system stats) and the device group (printers, Bluetooth, sound, network, battery, notifications), then the apps chevron.
- Popups open 8px under the bar, aligned to the edge of their button (the calendar is centred). Widths are 300 to 420px. The body scrolls past about 620px.
- Inside a card: 6px card padding, 12px between sections, 6px between a section heading and its body, 12px padding in a section body (4px for lists), 10px between row elements.

## Elevation & Depth

Depth is mostly tonal: ground (bar), inset (section bodies), surface (cards). Popup cards are the only lifted element and carry one soft shadow.

### Shadow Vocabulary
- **Popup lift** (black at 50%, blur 32px, 10px down): every popup card. Nothing else casts a shadow.

## Shapes

Corners derive from `shape.radius` (8px): controls 0.7x, rows +1, bar and section bodies +3, cards +6. Buttons, sliders, chips and switches are full pills. Icons in active rows sit on a 26px accent disc. There are no hard offset shadows and no coloured side borders.

## Components

Implemented in `dot/.config/quickshell/leo-shell/`; `.scratch/quickshell-redesign/porting-brief.md` lists each component's properties.

- **BarButton:** icon and/or label, 26px tall. Hover fills with text at 8%, an open popup at 12%. Tones: accent (current), dim (muted), warn, alert. An amber dot marks attention.
- **PopupCard:** surface card with title, muted subtitle, round header tools, a body of sections and a right-aligned footer of pill buttons. Escape or a click outside closes it; clicking another bar button switches popups. It fades and slides 6px down on open (140 to 180ms, ease out).
- **Section:** optional heading plus a body on the inset colour. Plain headings are small and muted; a section about one thing uses its name in strong text with a tag chip and a status chip.
- **ListRow:** icon, title, muted subtitle, trailing text or glyph. `active` puts the icon on a jade disc and tints the trailing text. `selected` highlights the row and can expand it inline (for example a Wi-Fi password field).
- **Meter:** label and value over a 6px jade track, amber from 75%, rose from 90% (system stats: 80% and 95%).
- **PillSlider:** 30px pill; the fill is pearl with the icon inside it; muted turns the fill grey and strikes the value.
- **PillButton:** normal (text at 8%), primary (jade fill, ground text), danger (rose at 15%, rose text).
- **TileButton:** icon over label on the inset colour. Destructive tiles (Log out, Restart, Shut down) need a second click within 3 seconds, and show "Confirm" in rose while armed.
- **Toggle, Chip, IconButton, KeyValue, UsageBar, InputField:** as named; all follow the colour and shape rules above.

Other apps follow the same roles through `system-theme-apply.py`: Walker (ground, surface box, rule outline, jade selection), Mako (ground, rule outline, rose outline for critical), Hyprland (rule borders).

### Authentication

SDDM login and native Hyprlock share the graphite Quickshell palette over the existing user-selected wallpaper, never a screenshot of the open session. The form card is centred horizontally, with its centre 100px below screen centre. It is 400×240px with the card radius of 14px and a rule border; the password field is 344×48px. Above it, the clock is 72px and the date is 18px in pearl after contrast review. Form text is 18px; hints are 16px. These larger sizes are specific to authentication, not replacements for the desktop typography tokens.

Hyprlock uses native point-sized labels, calibrated by the generator, with a 54pt clock matching roughly 72px and Pango placeholder sizes converted from pixels. It displays `$USER` and submits with Enter, not a fake button. SDDM has an editable remembered username, a session selector and a real Sign in button. Restart and shutdown require confirmation, using a three-second second click on the lock screen and a modal with Cancel focused by default at login. See [login and lock](docs/login-lock.md) for operation and validation limits.

## Do's and Don'ts

- Do take every colour from `Theme` (or palette.json outside Quickshell). Don't hard-code hex values in widgets.
- Do use the accent for state. Don't use it for borders, headings or decoration.
- Do build popups from the kit components. Don't draw a new card, row or button style in a widget.
- Do keep one icon family (Nerd Font Material Design). Don't mix in Font Awesome glyphs or emoji.
- Do ask for a second click before logging out, restarting or shutting down.
- Don't add a second border colour or tint window borders with the accent.

pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

// Colours, type and shape for the whole shell. Values come from
// ~/.config/leo/theme/palette.json and update live when that file changes.
// The fallbacks below match the palette so the bar still renders without it.
Singleton {
  id: root

  property var palette: ({})
  readonly property var _colors: palette.colors || ({})
  readonly property var _font: palette.font || ({})
  readonly property var _shape: palette.shape || ({})

  readonly property color background: _colors.background || "#1B1D24"
  readonly property color surface: _colors.surface || "#272A34"
  readonly property color rule: _colors.rule || "#3B404E"
  readonly property color foreground: _colors.foreground || "#DCDDE5"
  readonly property color muted: _colors.muted || "#A0A4B5"
  readonly property color accent: _colors.accent || "#64D6A5"
  readonly property color alert: _colors.alert || "#F7768E"
  readonly property color warning: _colors.warning || "#E0AF68"
  readonly property color good: _colors.good || "#9ECE6A"

  // Grouped content inside a popup sits on this, between background and surface.
  readonly property color inset: mix(background, surface, 0.45)

  readonly property string fontFamily: _font.family || "JetBrainsMono Nerd Font"
  // Icons come from the proportional Nerd Font so glyphs keep their natural width.
  readonly property string glyphFamily: "JetBrainsMono Nerd Font Propo"
  readonly property int fontSize: _font.size || 13
  readonly property int fontSmall: fontSize - 2
  readonly property int fontTitle: fontSize + 3
  readonly property int fontWeight: _font.weight || 400
  readonly property int glyphSize: fontSize + 3

  readonly property int radius: _shape.radius !== undefined ? _shape.radius : 8
  readonly property int barHeight: _shape.barHeight || 34
  // Space between the floating bar and the top edge of the screen.
  readonly property int barInset: 8
  // Matches Hyprland's gaps_out so the bar lines up with window edges.
  readonly property int gap: 10

  function alpha(color, amount) {
    return Qt.rgba(color.r, color.g, color.b, amount)
  }

  function mix(a, b, amount) {
    return Qt.rgba(
      a.r + (b.r - a.r) * amount,
      a.g + (b.g - a.g) * amount,
      a.b + (b.b - a.b) * amount,
      1
    )
  }

  function toneColor(tone) {
    if (tone === "alert") return alert
    if (tone === "warn" || tone === "warning") return warning
    if (tone === "ok" || tone === "good") return good
    if (tone === "accent") return accent
    return muted
  }

  FileView {
    path: (Quickshell.env("XDG_CONFIG_HOME") || Quickshell.env("HOME") + "/.config")
      + "/leo/theme/palette.json"
    blockLoading: true
    watchChanges: true
    onFileChanged: reload()
    onLoaded: {
      try {
        root.palette = JSON.parse(text())
      } catch (error) {
        console.warn("palette.json is not valid JSON; keeping the previous palette:", error)
      }
    }
  }
}

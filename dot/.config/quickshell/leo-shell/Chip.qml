import QtQuick

// Small rounded tag. tone: "", "ok", "warn", "alert" or "accent".
Rectangle {
  id: root

  property string text: ""
  property string tone: ""

  readonly property color toneColor: tone === "" ? Theme.muted : Theme.toneColor(tone)

  implicitWidth: label.implicitWidth + 14
  implicitHeight: label.implicitHeight + 6
  radius: height / 2
  color: tone === "" ? Theme.alpha(Theme.foreground, 0.08) : Theme.alpha(toneColor, 0.15)

  Label {
    id: label
    anchors.centerIn: parent
    text: root.text
    small: true
    color: root.toneColor
    font.weight: Font.Medium
  }
}

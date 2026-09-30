import QtQuick
import QtQuick.Layouts

// A compact share bar: "claude-opus-4   ▰▰▰▰▱   3.1M".
RowLayout {
  id: root

  property string label: ""
  property real fraction: 0
  property string value: ""

  Layout.fillWidth: true
  spacing: 12

  Label {
    Layout.fillWidth: true
    text: root.label
    elide: Text.ElideMiddle
  }

  Rectangle {
    Layout.preferredWidth: 90
    implicitHeight: 6
    radius: 3
    color: Theme.alpha(Theme.foreground, 0.12)

    Rectangle {
      width: Math.max(root.fraction > 0 ? 2 : 0, parent.width * Math.min(1, root.fraction))
      height: parent.height
      radius: parent.radius
      color: Theme.muted
    }
  }

  Label {
    Layout.preferredWidth: 56
    horizontalAlignment: Text.AlignRight
    text: root.value
    muted: true
  }
}

import QtQuick
import QtQuick.Layouts

// "Gateway            192.168.1.1"
RowLayout {
  id: root

  property string key: ""
  property string value: ""
  property color valueColor: Theme.foreground
  // Let a long value wrap onto more lines instead of being cut off.
  property bool wrap: false

  Layout.fillWidth: true
  spacing: 16

  Label {
    Layout.alignment: Qt.AlignTop
    text: root.key
    muted: true
  }

  Label {
    Layout.fillWidth: true
    horizontalAlignment: Text.AlignRight
    text: root.value
    color: root.valueColor
    wrapMode: root.wrap ? Text.Wrap : Text.NoWrap
    elide: root.wrap ? Text.ElideNone : Text.ElideRight
  }
}

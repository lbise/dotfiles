import QtQuick

// Text button used in popup footers and inside sections.
// kind: "normal", "primary" (accent fill) or "danger".
Rectangle {
  id: root

  property string text: ""
  property string icon: ""
  property string kind: "normal"
  property bool enabled: true

  signal clicked()

  readonly property color labelColor: !enabled ? Theme.alpha(Theme.muted, 0.6)
    : kind === "primary" ? Theme.background
    : kind === "danger" ? Theme.alert
    : Theme.foreground

  implicitWidth: row.implicitWidth + 28
  implicitHeight: 32
  radius: 16
  opacity: enabled ? 1 : 0.55
  color: kind === "primary" ? (pointer.containsMouse ? Qt.lighter(Theme.accent, 1.08) : Theme.accent)
    : kind === "danger" ? Theme.alpha(Theme.alert, pointer.containsMouse ? 0.22 : 0.15)
    : Theme.alpha(Theme.foreground, pointer.containsMouse ? 0.12 : 0.08)
  border.width: activeFocus ? 1 : 0
  border.color: Theme.accent
  activeFocusOnTab: enabled
  Keys.onReturnPressed: if (root.enabled) root.clicked()
  Keys.onSpacePressed: if (root.enabled) root.clicked()

  Behavior on color { ColorAnimation { duration: 120 } }

  Row {
    id: row
    anchors.centerIn: parent
    spacing: 6

    Glyph {
      visible: root.icon !== ""
      text: root.icon
      size: 14
      color: root.kind === "normal" ? Theme.muted : root.labelColor
      anchors.verticalCenter: parent.verticalCenter
    }

    Label {
      text: root.text
      color: root.labelColor
      font.weight: root.kind === "primary" ? Font.DemiBold : Theme.fontWeight
      anchors.verticalCenter: parent.verticalCenter
    }
  }

  MouseArea {
    id: pointer
    anchors.fill: parent
    hoverEnabled: true
    enabled: root.enabled
    cursorShape: Qt.PointingHandCursor
    onClicked: { console.log("[debug] pill clicked " + root.text); root.clicked() } // TEMP
  }
}

import QtQuick

// Round icon button for popup headers (refresh, close, month arrows).
Rectangle {
  id: root

  property string icon: ""
  property string tooltip: ""
  property bool busy: false

  signal clicked()

  implicitWidth: 30
  implicitHeight: 30
  radius: width / 2
  color: pointer.containsMouse ? Theme.alpha(Theme.foreground, 0.12) : Theme.alpha(Theme.foreground, 0.06)
  border.width: activeFocus ? 1 : 0
  border.color: Theme.accent
  activeFocusOnTab: true
  Keys.onReturnPressed: root.clicked()
  Keys.onSpacePressed: root.clicked()

  Behavior on color { ColorAnimation { duration: 120 } }

  Glyph {
    id: glyph
    anchors.centerIn: parent
    text: root.icon
    size: 15
    color: pointer.containsMouse ? Theme.foreground : Theme.muted

    RotationAnimation on rotation {
      running: root.busy
      loops: Animation.Infinite
      from: 0
      to: 360
      duration: 900
      onStopped: glyph.rotation = 0
    }
  }

  MouseArea {
    id: pointer
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: root.clicked()
  }
}

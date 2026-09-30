import QtQuick
import QtQuick.Layouts

// Icon over a short label, for rows of actions such as the power buttons.
// With `confirm: true` the first click arms the tile and a second click
// within three seconds runs it.
Rectangle {
  id: root

  property string icon: ""
  property string label: ""
  property bool danger: false
  property bool confirm: false
  property bool armed: false

  signal activated()

  Layout.fillWidth: true
  implicitHeight: 62
  radius: Theme.radius
  color: armed ? Theme.alpha(Theme.alert, 0.18)
    : pointer.containsMouse ? Theme.alpha(Theme.foreground, 0.1)
    : Theme.inset
  border.width: activeFocus ? 1 : 0
  border.color: Theme.accent
  activeFocusOnTab: true
  Keys.onReturnPressed: root.press()
  Keys.onSpacePressed: root.press()

  Behavior on color { ColorAnimation { duration: 120 } }

  function press() {
    if (confirm && !armed) {
      armed = true
      disarm.restart()
      return
    }
    armed = false
    activated()
  }

  Timer {
    id: disarm
    interval: 3000
    onTriggered: root.armed = false
  }

  Column {
    anchors.centerIn: parent
    spacing: 6

    Glyph {
      anchors.horizontalCenter: parent.horizontalCenter
      text: root.icon
      size: 18
      color: root.danger || root.armed ? Theme.alert : Theme.foreground
    }

    Label {
      anchors.horizontalCenter: parent.horizontalCenter
      text: root.armed ? "Confirm" : root.label
      small: true
      color: root.armed ? Theme.alert : pointer.containsMouse ? Theme.foreground : Theme.muted
    }
  }

  MouseArea {
    id: pointer
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: root.press()
  }
}

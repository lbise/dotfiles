import QtQuick

Rectangle {
  id: root

  property bool checked: false

  signal toggled()

  implicitWidth: 34
  implicitHeight: 20
  radius: height / 2
  color: checked ? Theme.accent : Theme.alpha(Theme.foreground, 0.2)
  border.width: activeFocus ? 1 : 0
  border.color: Theme.foreground
  activeFocusOnTab: true
  Keys.onSpacePressed: root.toggled()
  Keys.onReturnPressed: root.toggled()

  Behavior on color { ColorAnimation { duration: 150 } }

  Rectangle {
    width: 14
    height: 14
    radius: 7
    y: 3
    x: root.checked ? root.width - width - 3 : 3
    color: root.checked ? Theme.background : Theme.foreground

    Behavior on x { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }
  }

  MouseArea {
    anchors.fill: parent
    cursorShape: Qt.PointingHandCursor
    onClicked: root.toggled()
  }
}

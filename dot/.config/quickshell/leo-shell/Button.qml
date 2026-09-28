import QtQuick

Rectangle {
  id: root

  property string label: ""
  property color foreground: "white"
  property color hoverColor: Qt.rgba(foreground.r, foreground.g, foreground.b, 0.12)
  property color fillColor: "transparent"
  property int horizontalPadding: 8
  property int controlHeight: 30
  property string fontFamily: "monospace"
  property int fontSize: 13

  signal clicked(int button)

  implicitWidth: labelText.implicitWidth + horizontalPadding * 2
  implicitHeight: controlHeight
  radius: 4
  color: mouseArea.containsMouse ? hoverColor : fillColor
  border.width: activeFocus ? 1 : 0
  border.color: foreground
  activeFocusOnTab: true
  Keys.onReturnPressed: root.clicked(Qt.LeftButton)
  Keys.onEnterPressed: root.clicked(Qt.LeftButton)
  Keys.onSpacePressed: root.clicked(Qt.LeftButton)

  Text {
    id: labelText
    anchors.centerIn: parent
    text: root.label
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: root.fontSize
  }

  MouseArea {
    id: mouseArea
    anchors.fill: parent
    acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: function(mouse) { root.clicked(mouse.button) }
  }
}

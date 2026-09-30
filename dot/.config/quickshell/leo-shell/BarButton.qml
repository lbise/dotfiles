import QtQuick

// A control in the bar: an icon, an optional label, or both.
Rectangle {
  id: root

  property string icon: ""
  property string label: ""
  // Muted text before the label, e.g. the day name before the time.
  property string prefix: ""
  // "", "alert", "warn", "dim" or "accent"
  property string tone: ""
  property bool open: false
  property color restColor: "transparent"
  property int horizontalPadding: 8
  property bool attention: false

  readonly property color contentColor: tone === "alert" ? Theme.alert
    : tone === "warn" ? Theme.warning
    : tone === "dim" ? Theme.muted
    : tone === "accent" ? Theme.accent
    : Theme.foreground

  signal clicked(int button)
  signal wheel(int delta)

  implicitWidth: content.implicitWidth + horizontalPadding * 2
  implicitHeight: Theme.barHeight - 8
  radius: Math.round(Theme.radius * 0.7)
  color: open ? Theme.alpha(Theme.foreground, 0.12)
    : pointer.containsMouse ? Theme.alpha(Theme.foreground, 0.08)
    : restColor
  border.width: activeFocus ? 1 : 0
  border.color: Theme.accent
  activeFocusOnTab: true

  Behavior on color { ColorAnimation { duration: 120 } }

  Keys.onReturnPressed: root.clicked(Qt.LeftButton)
  Keys.onEnterPressed: root.clicked(Qt.LeftButton)
  Keys.onSpacePressed: root.clicked(Qt.LeftButton)

  Row {
    id: content
    anchors.centerIn: parent
    spacing: 6

    Glyph {
      visible: root.icon !== ""
      text: root.icon
      color: root.contentColor
      anchors.verticalCenter: parent.verticalCenter
    }

    Label {
      visible: root.prefix !== ""
      text: root.prefix
      color: root.tone === "" ? Theme.muted : root.contentColor
      anchors.verticalCenter: parent.verticalCenter
    }

    Label {
      visible: root.label !== ""
      text: root.label
      color: root.contentColor
      anchors.verticalCenter: parent.verticalCenter
    }
  }

  Rectangle {
    visible: root.attention
    width: 6
    height: 6
    radius: 3
    color: Theme.warning
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.margins: 4
  }

  MouseArea {
    id: pointer
    anchors.fill: parent
    acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: function(mouse) { root.clicked(mouse.button) }
    onWheel: function(event) { root.wheel(event.angleDelta.y) }
  }
}

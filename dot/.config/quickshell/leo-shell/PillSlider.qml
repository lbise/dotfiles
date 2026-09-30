import QtQuick
import QtQuick.Layouts

// A tall rounded slider with its icon inside the fill, as in a control centre.
// Drag or scroll to change; `moved` reports the new value between 0 and 1.
ColumnLayout {
  id: root

  property string label: ""
  property string icon: ""
  property real value: 0
  property bool muted: false
  property real step: 0.05

  signal moved(real value)
  signal iconClicked()

  readonly property real shown: Math.max(0, Math.min(1, value))

  Layout.fillWidth: true
  spacing: 6

  Label {
    Layout.fillWidth: true
    Layout.leftMargin: 4
    visible: root.label !== ""
    text: root.label
    muted: true
    small: true
  }

  RowLayout {
    Layout.fillWidth: true
    spacing: 12

    Rectangle {
      id: track
      Layout.fillWidth: true
      implicitHeight: 30
      radius: 15
      color: Theme.alpha(Theme.foreground, 0.08)
      clip: true

      Rectangle {
        width: Math.max(track.height, track.width * root.shown)
        height: parent.height
        radius: parent.radius
        color: root.muted ? Theme.alpha(Theme.foreground, 0.2) : Theme.foreground

        Behavior on width {
          enabled: !drag.pressed
          NumberAnimation { duration: 120; easing.type: Easing.OutCubic }
        }
      }

      Glyph {
        x: 9
        anchors.verticalCenter: parent.verticalCenter
        text: root.icon
        size: 14
        color: root.muted ? Theme.foreground : Theme.background
      }

      MouseArea {
        id: drag
        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        function valueAt(x) { return Math.max(0, Math.min(1, x / track.width)) }
        onPressed: function(mouse) {
          if (mouse.x < 30) root.iconClicked()
          else root.moved(valueAt(mouse.x))
        }
        onPositionChanged: function(mouse) { if (pressed && mouse.x >= 0) root.moved(valueAt(mouse.x)) }
        onWheel: function(event) {
          var next = root.shown + (event.angleDelta.y > 0 ? root.step : -root.step)
          root.moved(Math.max(0, Math.min(1, next)))
        }
      }
    }

    Label {
      Layout.preferredWidth: 38
      horizontalAlignment: Text.AlignRight
      text: Math.round(root.value * 100) + "%"
      color: root.muted ? Theme.muted : Theme.foreground
      font.strikeout: root.muted
    }
  }
}

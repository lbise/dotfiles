import QtQuick
import QtQuick.Layouts

// A labelled usage bar: "RAM  46%" over a track, optional detail below.
// tone: "" (accent), "warn" or "alert".
ColumnLayout {
  id: root

  property string label: ""
  property string value: ""
  property real fraction: 0
  property string detail: ""
  property string tone: ""

  readonly property color fillColor: tone === "" ? Theme.accent : Theme.toneColor(tone)

  Layout.fillWidth: true
  spacing: 5

  RowLayout {
    Layout.fillWidth: true
    spacing: 12

    Label {
      Layout.fillWidth: true
      text: root.label
    }

    Label {
      text: root.value
      color: root.tone === "" ? Theme.foreground : root.fillColor
    }
  }

  Rectangle {
    Layout.fillWidth: true
    implicitHeight: 6
    radius: 3
    color: Theme.alpha(Theme.foreground, 0.12)

    Rectangle {
      width: parent.width * Math.max(0, Math.min(1, root.fraction))
      height: parent.height
      radius: parent.radius
      color: root.fillColor

      Behavior on width { NumberAnimation { duration: 250; easing.type: Easing.OutCubic } }
    }
  }

  Label {
    Layout.fillWidth: true
    visible: root.detail !== ""
    text: root.detail
    muted: true
    small: true
  }
}

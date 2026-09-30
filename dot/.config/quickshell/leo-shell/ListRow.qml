import QtQuick
import QtQuick.Layouts
import Quickshell.Widgets

// One row in a list: icon, title, optional subtitle and trailing text.
// `active` marks the current or connected item with an accent disc;
// `selected` highlights the row; children appear below it when `expanded`.
Rectangle {
  id: root

  property string icon: ""
  property string letter: ""
  property string imageSource: ""
  property string title: ""
  property string subtitle: ""
  property string trailing: ""
  property string trailingIcon: ""
  property bool active: false
  property bool selected: false
  property bool attention: false
  property bool interactive: true
  property bool expanded: false
  default property alias expansion: expansionColumn.data

  signal clicked(int button, real x, real y)
  signal wheel(real delta, int modifiers)

  readonly property color trailingColor: attention ? Theme.warning
    : active ? Theme.accent
    : Theme.muted

  Layout.fillWidth: true
  implicitHeight: layout.implicitHeight + 14
  radius: Theme.radius + 1
  color: selected ? Theme.alpha(Theme.foreground, 0.08)
    : interactive && pointer.containsMouse ? Theme.alpha(Theme.foreground, 0.06)
    : "transparent"

  Behavior on color { ColorAnimation { duration: 100 } }

  ColumnLayout {
    id: layout
    x: 8
    y: 7
    width: parent.width - 16
    spacing: 10

    RowLayout {
      Layout.fillWidth: true
      Layout.minimumHeight: 26
      spacing: 10

      Item {
        Layout.preferredWidth: 26
        Layout.preferredHeight: 26
        visible: root.icon !== "" || root.letter !== "" || root.imageSource !== ""

        Rectangle {
          anchors.fill: parent
          radius: width / 2
          visible: root.active && root.icon !== ""
          color: Theme.accent
        }

        Glyph {
          anchors.centerIn: parent
          visible: root.icon !== ""
          text: root.icon
          size: root.active ? 14 : 16
          color: root.active ? Theme.background : Theme.muted
        }

        Rectangle {
          anchors.centerIn: parent
          visible: root.letter !== "" && (root.imageSource === "" || image.status === Image.Error)
          width: 22
          height: 22
          radius: Math.round(Theme.radius * 0.6)
          color: Theme.alpha(Theme.foreground, 0.12)

          Label {
            anchors.centerIn: parent
            text: root.letter
            small: true
            strong: true
          }
        }

        IconImage {
          id: image
          anchors.centerIn: parent
          visible: root.imageSource !== "" && status !== Image.Error
          source: root.imageSource
          implicitSize: 18
        }
      }

      ColumnLayout {
        Layout.fillWidth: true
        spacing: 1

        Label {
          Layout.fillWidth: true
          text: root.title
        }

        Label {
          Layout.fillWidth: true
          visible: root.subtitle !== ""
          text: root.subtitle
          muted: true
          small: true
        }
      }

      Row {
        spacing: 6
        visible: root.trailing !== "" || root.trailingIcon !== ""

        Label {
          visible: root.trailing !== ""
          text: root.trailing
          small: true
          color: root.trailingColor
          anchors.verticalCenter: parent.verticalCenter
        }

        Glyph {
          visible: root.trailingIcon !== ""
          text: root.trailingIcon
          size: 14
          color: root.trailingColor
          anchors.verticalCenter: parent.verticalCenter
        }
      }
    }

    ColumnLayout {
      id: expansionColumn
      Layout.fillWidth: true
      Layout.bottomMargin: 2
      visible: root.expanded
      spacing: 10
    }
  }

  MouseArea {
    id: pointer
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    height: root.expanded ? 40 : parent.height
    enabled: root.interactive
    hoverEnabled: true
    acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
    cursorShape: Qt.PointingHandCursor
    onClicked: function(mouse) { root.clicked(mouse.button, mouse.x, mouse.y) }
    onWheel: function(event) {
      event.accepted = (event.modifiers & Qt.ShiftModifier) !== 0
      root.wheel(event.angleDelta.y, event.modifiers)
    }
  }
}

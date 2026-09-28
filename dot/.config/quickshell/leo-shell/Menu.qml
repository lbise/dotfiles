import QtQuick
import QtQuick.Layouts
import Quickshell

Item {
  id: root

  property color foreground: "white"
  property color background: "#222831"
  property string fontFamily: "monospace"
  property bool popupOpen: false

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  Button {
    id: button
    anchors.fill: parent
    label: "Menu"
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: root.popupOpen = !root.popupOpen
  }

  PopupWindow {
    id: popup
    visible: root.popupOpen
    color: "transparent"
    implicitWidth: 220
    implicitHeight: 170

    anchor {
      id: popupAnchor
      window: root.QsWindow.window
      adjustment: PopupAdjustment.Slide
      edges: Edges.Top | Edges.Left
      gravity: Edges.Bottom | Edges.Right
      rect.width: 1
      rect.height: 1

      onAnchoring: {
        var window = root.QsWindow.window
        if (!window) return
        var point = window.contentItem.mapFromItem(root, 0, root.height + 4)
        popupAnchor.rect.x = Math.round(point.x)
        popupAnchor.rect.y = Math.round(point.y)
      }
    }

    Rectangle {
      anchors.fill: parent
      radius: 6
      color: root.background
      border.color: root.foreground
      border.width: 1

      ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 4

        Text {
          text: "System"
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: 13
        }

        Button {
          Layout.fillWidth: true
          label: "Applications"
          foreground: root.foreground
          fontFamily: root.fontFamily
          horizontalPadding: 4
          onClicked: {
            root.popupOpen = false
            Quickshell.execDetached(["walker"])
          }
        }

        Button {
          Layout.fillWidth: true
          label: "Clipboard"
          foreground: root.foreground
          fontFamily: root.fontFamily
          horizontalPadding: 4
          onClicked: {
            root.popupOpen = false
            Quickshell.execDetached(["walker", "-m", "clipboard"])
          }
        }

        Button {
          Layout.fillWidth: true
          label: "Power and session"
          foreground: root.foreground
          fontFamily: root.fontFamily
          horizontalPadding: 4
          onClicked: {
            root.popupOpen = false
            Quickshell.execDetached(["system-menu.sh", "system"])
          }
        }
      }
    }
  }
}

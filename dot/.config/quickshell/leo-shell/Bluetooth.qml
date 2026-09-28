import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Bluetooth

Item {
  id: root

  property color foreground: "white"
  property color background: "#222831"
  property string fontFamily: "monospace"
  property bool popupOpen: false

  readonly property var adapter: Bluetooth.defaultAdapter
  readonly property var devices: Bluetooth.devices ? Bluetooth.devices.values : []
  readonly property int connectedCount: {
    var count = 0
    for (var i = 0; i < devices.length; i++)
      if (devices[i].connected) count++
    return count
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  Button {
    id: button
    anchors.fill: parent
    label: !root.adapter || !root.adapter.enabled ? "×" : ""
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: root.popupOpen = !root.popupOpen
  }

  PopupWindow {
    id: popup
    visible: root.popupOpen
    color: "transparent"
    implicitWidth: 280
    implicitHeight: Math.min(360, 90 + root.devices.length * 42)

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
        spacing: 6

        RowLayout {
          Layout.fillWidth: true
          Text {
            Layout.fillWidth: true
            text: "Bluetooth"
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: 13
          }
          Button {
            label: root.adapter && root.adapter.enabled ? "On" : "Off"
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: if (root.adapter) root.adapter.enabled = !root.adapter.enabled
          }
        }

        Repeater {
          model: root.devices

          Button {
            required property var modelData
            Layout.fillWidth: true
            label: (modelData.connected ? "● " : "○ ") + (modelData.name || modelData.address || "Unknown")
            foreground: root.foreground
            fontFamily: root.fontFamily
            horizontalPadding: 4
            onClicked: {
              if (modelData.connected) modelData.disconnect()
              else modelData.connect()
            }
          }
        }
      }
    }
  }
}

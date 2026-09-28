pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import Quickshell.Services.SystemTray
import Quickshell.Widgets

Item {
  id: root

  property color foreground: "white"
  property color muted: foreground
  property color background: "#222831"
  property color surface: "#2B3540"
  property color accent: foreground
  property string fontFamily: "monospace"
  property bool popupOpen: false

  readonly property var trayItems: {
    var result = []
    var seen = ({})
    var values = SystemTray.items.values
    for (var i = 0; i < values.length; i++) {
      var item = values[i]
      if (item.status === Status.Passive) continue
      var key = String(item.id || item.title || i)
      if (seen[key]) continue
      seen[key] = true
      result.push(item)
    }
    return result
  }

  implicitWidth: trigger.implicitWidth
  implicitHeight: trigger.implicitHeight

  IpcHandler {
    target: "leo.tray"
    function open(): void { root.popupOpen = true }
    function close(): void { root.popupOpen = false }
    function toggle(): void { root.popupOpen = !root.popupOpen }
  }

  function iconSource(icon) {
    var source = String(icon || "")
    if (source === "") return ""
    if (source.indexOf("image://icon/") === 0) source = source.slice(13)
    if (source.indexOf("://") !== -1 || source[0] === "/") return source
    if (source === "input-keyboard-symbolic")
      return "file:///usr/share/icons/breeze-dark/devices/16/input-keyboard-symbolic.svg"

    // Dropbox's tray PNG lives below the search root it publishes.
    var dropbox = source.match(/^(dropboxstatus-[^?]+)\?path=(.*)$/)
    if (dropbox) return "file://" + dropbox[2] + "/hicolor/16x16/status/" + dropbox[1] + ".png"

    if (source.indexOf("?path=") !== -1) return "image://icon/" + source
    return "image://icon/" + source + "?path=/usr/share/icons/Adwaita"
  }

  function displayMenu(item, mouse, row) {
    var window = row.QsWindow.window
    if (!window || !item || !item.display) return
    var point = window.contentItem.mapFromItem(row, mouse.x, mouse.y)
    item.display(window, point.x, point.y)
  }

  function appTitle(item) {
    var title = String(item.title || "").trim()
    if (/^(chrome|chromium)_status_icon(_\d+)?$/i.test(title)) return "Browser app"
    return title || String(item.id || "App")
  }

  Button {
    id: trigger
    anchors.fill: parent
    label: root.trayItems.length ? "Apps · " + root.trayItems.length : "Apps"
    foreground: root.popupOpen ? root.accent : root.foreground
    fillColor: root.popupOpen
      ? Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.13)
      : root.surface
    fontFamily: root.fontFamily
    horizontalPadding: 11
    onClicked: root.popupOpen = !root.popupOpen
  }

  PopupWindow {
    id: popup
    visible: root.popupOpen
    grabFocus: true
    color: "transparent"
    implicitWidth: 300
    implicitHeight: Math.min(390, 64 + Math.max(1, root.trayItems.length) * 42)

    onVisibleChanged: {
      if (!visible) root.popupOpen = false
      else card.forceActiveFocus()
    }

    anchor {
      window: root.QsWindow.window
      adjustment: PopupAdjustment.Slide
      edges: Edges.Top | Edges.Left
      gravity: Edges.Bottom | Edges.Right
      rect.width: 1
      rect.height: 1

      onAnchoring: {
        var window = root.QsWindow.window
        if (!window) return
        var point = window.contentItem.mapFromItem(
          root, root.width - popup.width, root.height + 4
        )
        popup.anchor.rect.x = Math.round(point.x)
        popup.anchor.rect.y = Math.round(point.y)
      }
    }

    Rectangle {
      id: card
      anchors.fill: parent
      radius: 6
      color: root.background
      border.color: root.accent
      border.width: 1
      focus: true
      Keys.onEscapePressed: root.popupOpen = false

      ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 8

        RowLayout {
          Layout.fillWidth: true

          Text {
            Layout.fillWidth: true
            text: "Background apps"
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: 13
            font.bold: true
          }

          Button {
            label: "×"
            foreground: root.foreground
            fontFamily: root.fontFamily
            horizontalPadding: 6
            onClicked: root.popupOpen = false
          }
        }

        Flickable {
          Layout.fillWidth: true
          Layout.fillHeight: true
          clip: true
          contentHeight: itemsColumn.implicitHeight
          boundsBehavior: Flickable.StopAtBounds

          Column {
            id: itemsColumn
            width: parent.width
            spacing: 2

            Text {
              visible: root.trayItems.length === 0
              height: visible ? 40 : 0
              text: "No background apps"
              color: root.muted
              font.family: root.fontFamily
              font.pixelSize: 12
              verticalAlignment: Text.AlignVCenter
            }

            Repeater {
              model: root.trayItems

              Rectangle {
                id: itemRow
                required property var modelData
                width: itemsColumn.width
                height: 40
                radius: 4
                color: pointer.containsMouse ? root.surface : "transparent"

                RowLayout {
                  anchors.fill: parent
                  anchors.leftMargin: 8
                  anchors.rightMargin: 8
                  spacing: 10

                  Item {
                    Layout.preferredWidth: 20
                    Layout.preferredHeight: 20

                    IconImage {
                      id: trayIcon
                      anchors.centerIn: parent
                      width: 18
                      height: 18
                      source: root.iconSource(itemRow.modelData.icon)
                      implicitSize: 18
                    }

                    Text {
                      anchors.centerIn: parent
                      visible: trayIcon.status === Image.Error || trayIcon.source === ""
                      text: String(itemRow.modelData.title || "•").slice(0, 1)
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: 12
                    }
                  }

                  Text {
                    Layout.fillWidth: true
                    text: root.appTitle(itemRow.modelData)
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: 12
                    elide: Text.ElideRight
                  }

                  Text {
                    visible: itemRow.modelData.status === Status.NeedsAttention
                    text: "●"
                    color: root.accent
                    font.pixelSize: 10
                  }
                }

                MouseArea {
                  id: pointer
                  anchors.fill: parent
                  acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onPressed: function(mouse) {
                    if (mouse.button === Qt.RightButton) {
                      root.displayMenu(itemRow.modelData, mouse, itemRow)
                      mouse.accepted = true
                    }
                  }
                  onClicked: function(mouse) {
                    if (mouse.button === Qt.RightButton) return
                    if (mouse.button === Qt.MiddleButton) {
                      itemRow.modelData.secondaryActivate()
                    } else if (itemRow.modelData.onlyMenu) {
                      root.displayMenu(itemRow.modelData, mouse, itemRow)
                    } else {
                      itemRow.modelData.activate()
                      root.popupOpen = false
                    }
                  }
                  onWheel: function(wheel) {
                    if (wheel.modifiers & Qt.ShiftModifier)
                      itemRow.modelData.scroll(wheel.angleDelta.y, false)
                    else
                      wheel.accepted = false // Let the drawer scroll instead.
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

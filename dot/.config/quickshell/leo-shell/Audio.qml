import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io

Item {
  id: root

  property color foreground: "white"
  property color background: "#222831"
  property string fontFamily: "monospace"
  property bool popupOpen: false
  property real volume: 0
  property bool muted: false

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function refresh() {
    if (!statusProcess.running) statusProcess.running = true
  }

  function applyStatus(output) {
    var match = String(output || "").match(/Volume:\s*([0-9.]+)(?:\s+(MUTED))?/)
    if (!match) return
    root.volume = Number(match[1])
    root.muted = !!match[2]
  }

  function changeVolume(delta) {
    var amount = Math.round(Math.abs(delta) * 100) + "%"
    Quickshell.execDetached([
      "wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", amount + (delta < 0 ? "-" : "+")
    ])
    refreshTimer.restart()
  }

  function toggleMute() {
    Quickshell.execDetached(["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"])
    refreshTimer.restart()
  }

  Process {
    id: statusProcess
    command: ["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.applyStatus(text)
    }
  }

  Timer {
    id: pollTimer
    interval: 2000
    repeat: true
    running: true
    onTriggered: root.refresh()
  }

  Timer {
    id: refreshTimer
    interval: 150
    onTriggered: root.refresh()
  }

  Component.onCompleted: root.refresh()

  Button {
    id: button
    anchors.fill: parent
    label: root.muted ? "" : (root.volume < 0.5 ? "" : "")
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: function(mouseButton) {
      if (mouseButton === Qt.RightButton) root.toggleMute()
      else root.popupOpen = !root.popupOpen
    }
  }

  PopupWindow {
    id: popup
    visible: root.popupOpen
    color: "transparent"
    implicitWidth: 250
    implicitHeight: 112

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
        spacing: 8

        Text {
          text: "Audio  " + Math.round(root.volume * 100) + "%"
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: 13
        }

        RowLayout {
          Layout.fillWidth: true
          spacing: 6

          Button {
            Layout.fillWidth: true
            label: "−"
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: root.changeVolume(-0.05)
          }
          Button {
            Layout.fillWidth: true
            label: root.muted ? "Unmute" : "Mute"
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: root.toggleMute()
          }
          Button {
            Layout.fillWidth: true
            label: "+"
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: root.changeVolume(0.05)
          }
        }
      }
    }
  }
}

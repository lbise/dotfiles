pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io

Item {
  id: root

  property color foreground: "white"
  property color background: "#222831"
  property color accent: "#70B8B0"
  property color alert: "#E06C75"
  property string fontFamily: "monospace"
  property bool popupOpen: false
  property bool loaded: false
  property var status: ({ ok: true, error: "", printers: [] })
  property string actionError: ""
  property string busyPrinter: ""

  readonly property string script: (Quickshell.env("HOME") || "") + "/.scripts/system/system-printers.py"
  readonly property var printers: status.printers || []
  readonly property int jobCount: {
    var count = 0
    for (var i = 0; i < printers.length; i++) count += printers[i].jobs.length
    return count
  }
  // Attention means the queue cannot make progress: paused, rejecting jobs,
  // or holding jobs for a printer that is off the network.
  readonly property bool needsAttention: {
    if (!status.ok) return true
    for (var i = 0; i < printers.length; i++) {
      var printer = printers[i]
      if (printer.state === "paused" || !printer.accepting) return true
      if (printer.jobs.length > 0 && printer.network.reachable === false) return true
    }
    return false
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function refresh() {
    if (!statusProcess.running) statusProcess.running = true
  }

  function runAction(action, name) {
    if (actionProcess.running) return
    actionError = ""
    busyPrinter = name
    actionProcess.command = [root.script, action, name]
    actionProcess.running = true
  }

  function applyStatus(text) {
    try {
      status = JSON.parse(text)
    } catch (error) {
      status = { ok: false, error: "Could not read printer status", printers: [] }
    }
    loaded = true
  }

  function stateLabel(printer) {
    if (printer.state === "paused") return "Paused"
    if (!printer.accepting) return "Rejecting jobs"
    if (printer.state === "printing") return "Printing"
    return "Ready"
  }

  function networkLabel(network) {
    var parts = []
    if (network.reachable === true) parts.push("Reachable")
    else if (network.reachable === false) parts.push("Unreachable")
    if (network.address) parts.push(network.address)
    if (network.detail) parts.push(network.detail)
    return parts.join("  ·  ")
  }

  function networkColor(network) {
    if (network.reachable === true) return root.accent
    if (network.reachable === false) return root.alert
    return Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.5)
  }

  function formatSize(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB"
    return Math.max(1, Math.round(bytes / 1024)) + " KB"
  }

  Button {
    id: button
    anchors.fill: parent
    label: {
      if (!root.status.ok || (root.loaded && root.printers.length === 0)) return "󰹝"
      var icon = root.needsAttention ? "󰐬" : "󰐪"
      return root.jobCount > 0 ? icon + " " + root.jobCount : icon
    }
    foreground: root.needsAttention ? root.alert : root.foreground
    fontFamily: root.fontFamily
    onClicked: function(mouseButton) {
      if (mouseButton === Qt.MiddleButton) {
        Quickshell.execDetached(["system-config-printer"])
      } else {
        root.popupOpen = !root.popupOpen
        if (root.popupOpen) root.refresh()
      }
    }
  }

  Process {
    id: statusProcess
    command: [root.script, "status"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.applyStatus(text)
    }
    stderr: StdioCollector { waitForEnd: true }
  }

  Process {
    id: actionProcess
    stderr: StdioCollector {
      id: actionStderr
      waitForEnd: true
    }
    onExited: function(exitCode, exitStatus) {
      if (exitCode !== 0) {
        root.actionError = String(actionStderr.text || "Printer action failed").trim()
      }
      root.busyPrinter = ""
      root.refresh()
    }
  }

  // Poll slowly for the bar icon; faster while the popup is visible.
  Timer {
    interval: root.popupOpen ? 5000 : 60000
    repeat: true
    running: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  PopupWindow {
    id: popup
    visible: root.popupOpen
    grabFocus: true
    onVisibleChanged: {
      if (!visible) {
        root.popupOpen = false
        root.actionError = ""
      } else {
        card.forceActiveFocus()
      }
    }
    color: "transparent"
    implicitWidth: 380
    implicitHeight: content.implicitHeight + 32

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
        var point = window.contentItem.mapFromItem(root, root.width - popup.width, root.height + 4)
        popup.anchor.rect.x = Math.round(point.x)
        popup.anchor.rect.y = Math.round(point.y)
      }
    }

    Rectangle {
      id: card
      anchors.fill: parent
      radius: 6
      color: root.background
      border.color: root.foreground
      border.width: 1
      focus: true
      Keys.onEscapePressed: root.popupOpen = false

      ColumnLayout {
        id: content
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: 16
        spacing: 10

        RowLayout {
          Layout.fillWidth: true
          Text {
            Layout.fillWidth: true
            text: "Printers"
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: 15
            font.bold: true
          }
          Button {
            label: statusProcess.running ? "…" : "↻"
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: root.refresh()
          }
          Button {
            label: "×"
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: root.popupOpen = false
          }
        }

        Text {
          Layout.fillWidth: true
          visible: !root.status.ok || (root.loaded && root.printers.length === 0) || !root.loaded
          text: !root.loaded ? "Checking printers…"
            : !root.status.ok ? root.status.error
            : "No printers configured"
          color: root.status.ok ? root.foreground : root.alert
          opacity: root.status.ok ? 0.75 : 1
          font.family: root.fontFamily
          font.pixelSize: 12
          wrapMode: Text.Wrap
        }

        Repeater {
          model: root.printers
          PrinterCard {}
        }

        Text {
          Layout.fillWidth: true
          visible: root.actionError !== ""
          text: root.actionError
          color: root.alert
          font.family: root.fontFamily
          font.pixelSize: 11
          wrapMode: Text.Wrap
        }

        Button {
          Layout.alignment: Qt.AlignRight
          label: "Printer settings"
          fontSize: 12
          foreground: root.foreground
          fontFamily: root.fontFamily
          onClicked: {
            root.popupOpen = false
            Quickshell.execDetached(["system-config-printer"])
          }
        }
      }
    }
  }

  component PrinterCard: Rectangle {
    id: printerCard

    required property var modelData
    readonly property bool busy: root.busyPrinter === modelData.name
    readonly property bool stopped: modelData.state === "paused" || !modelData.accepting
    readonly property var problems: {
      var list = modelData.reasons.filter(function(reason) { return reason !== "Paused" })
      if (modelData.message && stopped) list.push(modelData.message)
      return list
    }
    // While a queue runs, CUPS's state message is progress ("Sending data…"), not an error.
    readonly property string progress: stopped ? "" : modelData.message

    Layout.fillWidth: true
    implicitHeight: cardContent.implicitHeight + 20
    radius: 4
    color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08)

    ColumnLayout {
      id: cardContent
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.top: parent.top
      anchors.margins: 10
      spacing: 5

      RowLayout {
        Layout.fillWidth: true
        spacing: 8
        Text {
          Layout.fillWidth: true
          text: printerCard.modelData.description + (printerCard.modelData.isDefault ? "  ·  default" : "")
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: 13
          font.bold: true
          elide: Text.ElideRight
        }
        Text {
          text: root.stateLabel(printerCard.modelData)
          color: printerCard.stopped ? root.alert : printerCard.modelData.state === "printing" ? root.accent : root.foreground
          font.family: root.fontFamily
          font.pixelSize: 12
          font.bold: printerCard.stopped
        }
      }

      Text {
        Layout.fillWidth: true
        visible: text !== ""
        text: printerCard.modelData.model
        color: root.foreground
        opacity: 0.65
        font.family: root.fontFamily
        font.pixelSize: 10
        elide: Text.ElideRight
      }

      RowLayout {
        Layout.fillWidth: true
        spacing: 6
        Rectangle {
          implicitWidth: 7
          implicitHeight: 7
          radius: 3.5
          color: root.networkColor(printerCard.modelData.network)
        }
        Text {
          Layout.fillWidth: true
          text: root.networkLabel(printerCard.modelData.network)
          color: root.foreground
          opacity: 0.85
          font.family: root.fontFamily
          font.pixelSize: 11
          elide: Text.ElideRight
        }
      }

      Text {
        Layout.fillWidth: true
        visible: printerCard.problems.length > 0
        text: printerCard.problems.join("  ·  ")
        color: root.alert
        font.family: root.fontFamily
        font.pixelSize: 11
        wrapMode: Text.Wrap
      }

      Text {
        Layout.fillWidth: true
        visible: printerCard.progress !== ""
        text: printerCard.progress
        color: root.foreground
        opacity: 0.65
        font.family: root.fontFamily
        font.pixelSize: 11
        elide: Text.ElideRight
      }

      Text {
        Layout.fillWidth: true
        Layout.topMargin: 2
        text: printerCard.modelData.jobs.length === 0 ? "Queue empty"
          : printerCard.modelData.jobs.length + (printerCard.modelData.jobs.length === 1 ? " job queued" : " jobs queued")
        color: root.foreground
        opacity: 0.75
        font.family: root.fontFamily
        font.pixelSize: 11
      }

      Repeater {
        model: printerCard.modelData.jobs.slice(0, 5)
        Text {
          required property var modelData
          Layout.fillWidth: true
          text: (modelData.active ? "▸ " : "  ") + modelData.title + "  ·  " + root.formatSize(modelData.size) + "  ·  " + modelData.owner
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: 11
          elide: Text.ElideRight
        }
      }

      RowLayout {
        Layout.fillWidth: true
        Layout.topMargin: 2
        spacing: 6
        Item { Layout.fillWidth: true }
        Button {
          visible: printerCard.modelData.jobs.length > 0
          label: "Cancel jobs"
          fontSize: 12
          foreground: root.foreground
          fontFamily: root.fontFamily
          onClicked: if (!printerCard.busy) root.runAction("cancel-jobs", printerCard.modelData.name)
        }
        Button {
          label: printerCard.busy ? "…" : printerCard.stopped ? "Resume" : "Pause"
          fontSize: 12
          foreground: printerCard.stopped ? root.background : root.foreground
          fillColor: printerCard.stopped ? root.accent : "transparent"
          hoverColor: printerCard.stopped ? Qt.lighter(root.accent, 1.15) : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
          fontFamily: root.fontFamily
          onClicked: if (!printerCard.busy) root.runAction(printerCard.stopped ? "resume" : "pause", printerCard.modelData.name)
        }
      }
    }
  }
}

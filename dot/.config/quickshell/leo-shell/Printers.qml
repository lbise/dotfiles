pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io

// CUPS printers in the bar. The icon turns red when a queue is stuck and
// shows the number of queued jobs. The popup lists each printer with its
// network state and queue, and can pause, resume or clear it.
// Middle-click opens the printer settings.
BarButton {
  id: root

  property bool loaded: false
  property var status: ({ ok: true, error: "", printers: [] })
  property string actionError: ""
  property string busyPrinter: ""
  property string busyAction: ""

  readonly property string script: (Quickshell.env("HOME") || "") + "/.scripts/system/system-printers.py"
  readonly property var printers: status.printers || []
  readonly property int jobCount: {
    var count = 0
    for (var i = 0; i < printers.length; i++) count += printers[i].jobs.length
    return count
  }
  readonly property int attentionCount: printers.filter(function(p) { return root.printerNeedsAttention(p) }).length
  readonly property int offlineCount: printers.filter(function(p) { return p.network.reachable === false }).length
  readonly property bool needsAttention: !status.ok || attentionCount > 0

  // Material Design file-document-outline; not in Icons yet.

  icon: !status.ok || (loaded && printers.length === 0) ? Icons.printerOff
    : needsAttention ? Icons.printerAlert
    : Icons.printer
  label: jobCount > 0 ? String(jobCount) : ""
  tone: needsAttention ? "alert" : ""
  open: popup.shown

  onClicked: function(button) {
    if (button === Qt.MiddleButton) openSettings()
    else Popups.toggle("printers", popup.screenName)
  }

  function openSettings() {
    Popups.close()
    Quickshell.execDetached(["system-config-printer"])
  }

  function refresh() {
    if (!statusProcess.running) statusProcess.running = true
  }

  function runAction(action, name) {
    if (actionProcess.running) return
    actionError = ""
    busyPrinter = name
    busyAction = action
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

  function isStopped(printer) {
    return printer.state === "paused" || !printer.accepting
  }

  // Attention means the queue cannot make progress: paused, rejecting jobs,
  // or holding jobs for a printer that is off the network.
  function printerNeedsAttention(printer) {
    if (isStopped(printer)) return true
    return printer.jobs.length > 0 && printer.network.reachable === false
  }

  function stateLabel(printer) {
    if (printer.state === "paused") return "Paused"
    if (!printer.accepting) return "Rejecting jobs"
    if (printer.network.reachable === false) return "Unreachable"
    if (printer.state === "printing") return "Printing"
    return "Ready"
  }

  function stateTone(printer) {
    var label = stateLabel(printer)
    if (label === "Ready") return "ok"
    if (label === "Printing") return "accent"
    return "alert"
  }

  function networkLabel(network) {
    var parts = []
    if (network.reachable === true) parts.push("Reachable")
    else if (network.reachable === false) parts.push("Unreachable")
    if (network.address) parts.push(network.address)
    if (network.detail) parts.push(network.detail)
    return parts.join(" · ")
  }

  function networkColor(network) {
    if (network.reachable === false) return Theme.alert
    if (network.reachable === true) return Theme.foreground
    return Theme.muted
  }

  function queueLabel(count) {
    if (count === 0) return "Empty"
    return count + (count === 1 ? " job queued" : " jobs queued")
  }

  function formatSize(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB"
    return Math.max(1, Math.round(bytes / 1024)) + " KB"
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
      root.busyAction = ""
      root.refresh()
    }
  }

  // Poll slowly for the bar icon; faster while the popup is visible.
  Timer {
    interval: popup.shown ? 5000 : 60000
    repeat: true
    running: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  Connections {
    target: popup
    function onShownChanged() {
      if (!popup.shown) root.actionError = ""
    }
  }

  PopupCard {
    id: popup
    popupId: "printers"
    anchorItem: root
    align: "right"
    cardWidth: 380
    title: "Printers"
    subtitle: !root.loaded ? "Checking printers…"
      : !root.status.ok ? root.status.error
      : root.printers.length === 0 ? "No printers configured"
      : root.attentionCount === 1 ? "1 needs attention"
      : root.attentionCount > 1 ? root.attentionCount + " need attention"
      : root.offlineCount === 1 && root.printers.length === 1 ? "Printer offline"
      : root.offlineCount > 0 ? root.offlineCount + " offline"
      : "All ready"

    onOpened: root.refresh()

    tools: [
      IconButton {
        icon: Icons.refresh
        busy: statusProcess.running
        onClicked: root.refresh()
      },
      IconButton {
        icon: Icons.close
        onClicked: Popups.close()
      }
    ]

    Label {
      Layout.fillWidth: true
      Layout.leftMargin: 10
      Layout.rightMargin: 10
      visible: root.loaded && root.status.ok && root.printers.length === 0
      text: "No printers configured"
      muted: true
    }

    Repeater {
      model: root.printers
      PrinterSection {}
    }

    Label {
      Layout.fillWidth: true
      Layout.leftMargin: 10
      Layout.rightMargin: 10
      visible: root.actionError !== ""
      text: root.actionError
      color: Theme.alert
      small: true
      wrapMode: Text.Wrap
      elide: Text.ElideNone
    }

    footer: [
      PillButton {
        text: "Printer settings"
        icon: Icons.cog
        onClicked: root.openSettings()
      }
    ]
  }

  component PrinterSection: Section {
    id: section

    required property var modelData
    readonly property bool busy: root.busyPrinter === modelData.name
    readonly property bool stopped: root.isStopped(modelData)
    readonly property var problems: {
      var list = modelData.reasons.filter(function(reason) { return reason !== "Paused" })
      if (modelData.message && stopped) list.push(modelData.message)
      return list
    }
    // While a queue runs, CUPS's state message is progress ("Sending data…"), not an error.
    readonly property string progress: stopped ? "" : modelData.message

    title: modelData.description
    tag: modelData.isDefault ? "Default" : ""
    status: root.stateLabel(modelData)
    statusTone: root.stateTone(modelData)

    Label {
      Layout.fillWidth: true
      visible: section.problems.length > 0
      text: section.problems.join(" · ")
      color: Theme.alert
      wrapMode: Text.Wrap
      elide: Text.ElideNone
    }

    ColumnLayout {
      Layout.fillWidth: true
      spacing: 8

      KeyValue {
        wrap: true
        visible: section.modelData.model !== ""
        key: "Model"
        value: section.modelData.model
      }

      KeyValue {
        wrap: true
        key: section.modelData.connection === "network" ? "Network" : "Connection"
        value: root.networkLabel(section.modelData.network)
        valueColor: root.networkColor(section.modelData.network)
      }

      KeyValue {
        wrap: true
        key: "Queue"
        value: root.queueLabel(section.modelData.jobs.length)
      }
    }

    Label {
      Layout.fillWidth: true
      visible: section.progress !== ""
      text: section.progress
      muted: true
      small: true
    }

    // Job rows bleed into the section padding so their icons line up with the text above.
    ColumnLayout {
      Layout.fillWidth: true
      Layout.leftMargin: -8
      Layout.rightMargin: -8
      visible: section.modelData.jobs.length > 0
      spacing: 0

      Repeater {
        model: section.modelData.jobs.slice(0, 5)

        ListRow {
          required property var modelData
          icon: modelData.active ? Icons.printer : Icons.document
          title: modelData.title || "Untitled"
          subtitle: root.formatSize(modelData.size) + " · " + modelData.owner
          trailing: modelData.active ? "Printing" : ""
          active: modelData.active
          interactive: false
        }
      }
    }

    RowLayout {
      Layout.fillWidth: true
      spacing: 6

      Item { Layout.fillWidth: true }

      PillButton {
        visible: section.modelData.jobs.length > 0
        text: section.busy && root.busyAction === "cancel-jobs" ? "Cancelling…" : "Cancel jobs"
        kind: "danger"
        enabled: !section.busy
        onClicked: root.runAction("cancel-jobs", section.modelData.name)
      }

      PillButton {
        text: section.busy && root.busyAction === "resume" ? "Resuming…"
          : section.busy && root.busyAction === "pause" ? "Pausing…"
          : section.stopped ? "Resume" : "Pause"
        kind: section.stopped ? "primary" : "normal"
        enabled: !section.busy
        onClicked: root.runAction(section.stopped ? "resume" : "pause", section.modelData.name)
      }
    }
  }
}

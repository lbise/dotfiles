import QtQuick
import Quickshell
import Quickshell.Io
import "AiUsageModel.js" as Model

Item {
  id: root

  property var records: ({})
  property bool refreshing: false
  readonly property string home: Quickshell.env("HOME") || ""
  readonly property string stateDir: (Quickshell.env("XDG_STATE_HOME") || home + "/.local/state") + "/leo/ai-usage"
  readonly property string updateScript: home + "/.scripts/system/ai-usage-update.sh"

  function readRecord(id, content) {
    var next = Object.assign({}, root.records)
    next[id] = Model.parseRecord(content)
    root.records = next
  }

  function runUpdate(limitsOnly) {
    if (updateProcess.running) return
    updateProcess.command = [root.updateScript]
    if (limitsOnly) updateProcess.command.push("--limits-only")
    updateProcess.running = true
  }

  function refreshRecords() {
    claudeFile.reload()
    codexFile.reload()
    fireworksFile.reload()
  }

  Process {
    id: updateProcess
    stdout: StdioCollector { waitForEnd: true }
    stderr: StdioCollector { waitForEnd: true }
    onStarted: root.refreshing = true
    onExited: {
      root.refreshing = false
      root.refreshRecords()
    }
  }

  Timer {
    interval: 900000
    repeat: true
    running: true
    onTriggered: root.runUpdate(false)
  }

  FileView {
    id: claudeFile
    path: root.stateDir + "/claude.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.readRecord("claude", text())
    onLoadFailed: root.readRecord("claude", "")
  }

  FileView {
    id: codexFile
    path: root.stateDir + "/codex.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.readRecord("codex", text())
    onLoadFailed: root.readRecord("codex", "")
  }

  FileView {
    id: fireworksFile
    path: root.stateDir + "/fireworks.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.readRecord("fireworks", text())
    onLoadFailed: root.readRecord("fireworks", "")
  }

  Component.onCompleted: {
    root.refreshRecords()
    root.runUpdate(false)
  }
}

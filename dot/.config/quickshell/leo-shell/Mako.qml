pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "NotificationsModel.js" as Model

// The notification daemon's state, read through makoctl. Mako has no change
// signal, so this polls every few seconds and again when the popup opens.
Singleton {
  id: root

  property bool dnd: false
  property var entries: []
  property bool loaded: false
  // Newest notification id the user has seen; -1 until the first read.
  property int seenId: -1
  property string lastRaw: ""

  readonly property bool viewing: Popups.current === "notifications"
  readonly property int unread: seenId < 0 ? 0 : Model.unread(entries, seenId)
  readonly property int activeCount: entries.filter(function(item) { return item.active }).length

  onViewingChanged: if (viewing) refresh()

  function refresh() {
    if (!poll.running) poll.running = true
  }

  function markSeen() {
    seenId = Model.maxId(entries)
  }

  function setDnd(value) {
    // Show it straight away; the next read confirms it.
    root.dnd = value
    Quickshell.execDetached(["makoctl", "mode", value ? "-a" : "-r", "do-not-disturb"])
    settle.restart()
  }

  function toggleDnd() {
    setDnd(!dnd)
  }

  function dismissAll() {
    Quickshell.execDetached(["makoctl", "dismiss", "--all"])
    settle.restart()
  }

  // Gives makoctl a moment to apply a change before reading it back.
  Timer {
    id: settle
    interval: 300
    onTriggered: root.refresh()
  }

  Timer {
    interval: 5000
    repeat: true
    running: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  Process {
    id: poll
    command: [
      "sh", "-c",
      "makoctl mode; echo ---; makoctl history -j; echo ---; makoctl list -j"
    ]
    stdout: StdioCollector {
      onStreamFinished: {
        if (text === root.lastRaw) return
        root.lastRaw = text
        var state = Model.parse(text)
        root.dnd = state.dnd
        root.entries = state.entries
        var newest = Model.maxId(state.entries)
        // The first read, a restarted daemon and an open popup all count as seen.
        if (!root.loaded || root.seenId > newest || root.viewing) root.seenId = newest
        root.loaded = true
      }
    }
  }
}

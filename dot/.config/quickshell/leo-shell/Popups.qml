pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io

// Keeps at most one popup open, on one screen.
Singleton {
  id: root

  property string current: ""
  property string screen: ""
  // True when the open popup came from a click in the bar. Only then can it
  // take an xdg grab (keyboard focus, closing on a click elsewhere): the
  // compositor needs the input event that opened it. Popups opened from a
  // keybind through IPC show without a grab.
  property bool grab: false

  // A click on a bar button first dismisses the open popup through the focus
  // grab, then toggles. Ignoring a reopen right after closing stops that click
  // from immediately reopening the popup it just closed.
  property string lastClosed: ""
  property double lastClosedAt: 0

  function isOpen(id, screenName) {
    return current === id && (screen === "" || screen === screenName)
  }

  // From a click in the bar.
  function open(id, screenName) {
    grab = true
    current = id
    screen = screenName || focusedScreen()
  }

  // From IPC or a keybind.
  function openExternal(id) {
    grab = false
    current = id
    screen = focusedScreen()
  }

  function toggleExternal(id) {
    if (isOpen(id, focusedScreen())) close()
    else openExternal(id)
  }

  function close() {
    if (current === "") return
    lastClosed = current
    lastClosedAt = Date.now()
    current = ""
  }

  function toggle(id, screenName) {
    if (isOpen(id, screenName)) {
      close()
      return
    }
    if (lastClosed === id && Date.now() - lastClosedAt < 250) return
    open(id, screenName)
  }

  function focusedScreen() {
    var monitor = Hyprland.focusedMonitor
    return monitor ? monitor.name : ""
  }

  IpcHandler {
    target: "leo.popup"

    // quickshell ipc call leo.popup toggle wifi
    function toggle(name: string): void { root.toggleExternal(name) }
    function open(name: string): void { root.openExternal(name) }
    function close(): void { root.close() }
  }
}

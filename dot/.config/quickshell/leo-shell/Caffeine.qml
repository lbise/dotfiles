pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

// "Keep awake": holds a systemd idle inhibitor, which hypridle honours, so the
// screen neither locks nor turns off. A manual lock or suspend still works.
Singleton {
  id: root

  property bool active: false

  function toggle() {
    active = !active
  }

  // quickshell ipc call leo.keep-awake toggle
  IpcHandler {
    target: "leo.keep-awake"
    function toggle(): void { root.toggle() }
    function status(): string { return root.active ? "on" : "off" }
  }

  Process {
    running: root.active
    command: [
      "systemd-inhibit", "--what=idle", "--who=leo-shell",
      "--why=Keep awake", "--mode=block", "sleep", "infinity"
    ]
    onExited: root.active = false
  }
}

import QtQuick
import Quickshell.Io
import "SystemStatsModel.js" as Model

Item {
  id: root

  property bool running: false
  property var previousCpu: null
  property real cpuUsage: -1
  property var memory: null
  property string loadAverage: "Unavailable"
  property string uptime: "Unavailable"

  function refresh() {
    cpuFile.reload()
    memoryFile.reload()
    loadFile.reload()
    uptimeFile.reload()
  }

  onRunningChanged: {
    // Do not average the closed interval into the first sample after opening.
    previousCpu = null
    cpuUsage = -1
    if (running) refresh()
  }

  Timer {
    interval: 1000
    repeat: true
    running: root.running
    onTriggered: root.refresh()
  }

  FileView {
    id: cpuFile
    path: "/proc/stat"
    preload: root.running
    onLoaded: {
      var sample = Model.cpuSample(text())
      root.cpuUsage = Model.cpuUsage(root.previousCpu, sample)
      root.previousCpu = sample
    }
    onLoadFailed: { root.cpuUsage = -1; root.previousCpu = null }
  }

  FileView {
    id: memoryFile
    path: "/proc/meminfo"
    preload: root.running
    onLoaded: root.memory = Model.memory(text())
    onLoadFailed: root.memory = null
  }

  FileView {
    id: loadFile
    path: "/proc/loadavg"
    preload: root.running
    onLoaded: root.loadAverage = text().trim().split(/\s+/).slice(0, 3).join("  ")
    onLoadFailed: root.loadAverage = "Unavailable"
  }

  FileView {
    id: uptimeFile
    path: "/proc/uptime"
    preload: root.running
    onLoaded: root.uptime = Model.uptime(text())
    onLoadFailed: root.uptime = "Unavailable"
  }
}

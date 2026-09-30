import QtQuick
import Quickshell.Io
import "SystemStatsModel.js" as Model

// Live readings from /proc and /sys. Nothing is read while `running` is false.
Item {
  id: root

  property bool running: false
  property var previousCpu: null
  property real cpuUsage: -1
  property int cores: 0
  property var load: null
  property var memory: null
  property real cpuTemperature: -1
  property real gpuTemperature: -1
  property var diskTemperatures: []
  property var disks: []
  property string uptime: ""

  function refresh() {
    cpuFile.reload()
    memoryFile.reload()
    loadFile.reload()
    uptimeFile.reload()
  }

  function probe() {
    if (!probeProcess.running) probeProcess.running = true
  }

  onRunningChanged: {
    // Do not average the closed interval into the first sample after opening.
    previousCpu = null
    cpuUsage = -1
    if (running) {
      refresh()
      probe()
    }
  }

  Timer {
    interval: 1000
    repeat: true
    running: root.running
    onTriggered: root.refresh()
  }

  // Disk usage and temperatures change slowly and need a helper process.
  Timer {
    interval: 5000
    repeat: true
    running: root.running
    onTriggered: root.probe()
  }

  Process {
    id: probeProcess
    command: [
      "sh", "-c",
      "for d in /sys/class/hwmon/hwmon*; do "
        + "echo \"$(cat $d/name 2>/dev/null) $(cat $d/temp1_input 2>/dev/null)\"; "
        + "done; echo ---; df -B1 --output=size,used,target / /home 2>/dev/null"
    ]
    stdout: StdioCollector {
      onStreamFinished: {
        var parts = text.split("---")
        var temperatures = Model.temperatures(parts[0])
        root.cpuTemperature = temperatures.cpu
        root.gpuTemperature = temperatures.gpu
        root.diskTemperatures = temperatures.disks
        root.disks = Model.disks(parts[1] || "")
      }
    }
  }

  FileView {
    id: cpuFile
    path: "/proc/stat"
    preload: root.running
    onLoaded: {
      var sample = Model.cpuSample(text())
      root.cores = Model.coreCount(text())
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
    onLoaded: root.load = Model.loadAverage(text())
    onLoadFailed: root.load = null
  }

  FileView {
    id: uptimeFile
    path: "/proc/uptime"
    preload: root.running
    onLoaded: root.uptime = Model.uptime(text())
    onLoadFailed: root.uptime = ""
  }
}

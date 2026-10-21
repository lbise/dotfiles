pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "SystemStatsModel.js" as Model

// Processor, memory and per-drive disk readings. Data is read once a second, and only
// while the popup is open.
BarButton {
  id: root

  readonly property var memory: stats.memory
  readonly property real ramFraction: memory ? memory.used / memory.total : 0
  readonly property real swapFraction: memory && memory.swapTotal ? memory.swapUsed / memory.swapTotal : 0
  // Load is per core, so 1.0 means every core is busy.
  readonly property real loadFraction: stats.load && stats.cores > 0 ? Math.min(1, stats.load.one / stats.cores) : 0

  icon: Icons.memory
  open: popup.shown
  onClicked: Popups.toggle("sys", popup.screenName)

  function percent(fraction) {
    return Math.round(fraction * 100) + "%"
  }

  function usageTone(fraction) {
    return fraction >= 0.95 ? "alert" : fraction >= 0.8 ? "warn" : ""
  }

  // Chips run hotter than drives; each gets its own warning thresholds.
  function temperatureTone(degrees, warn, alert) {
    return degrees >= alert ? "alert" : degrees >= warn ? "warn" : ""
  }

  function degrees(value) {
    return Math.round(value) + " °C"
  }

  SystemStatsData {
    id: stats
    running: popup.shown
  }

  PopupCard {
    id: popup
    popupId: "sys"
    anchorItem: root
    align: "right"
    cardWidth: 330
    maxBodyHeight: 820
    title: "System"
    subtitle: stats.uptime !== "" ? "Up " + stats.uptime : ""

    tools: [
      IconButton {
        icon: Icons.close
        onClicked: Popups.close()
      }
    ]

    Section {
      title: "Processor"

      Meter {
        label: "Usage"
        value: stats.cpuUsage < 0 ? "…" : root.percent(stats.cpuUsage)
        fraction: Math.max(0, stats.cpuUsage)
        tone: stats.cpuUsage < 0 ? "" : root.usageTone(stats.cpuUsage)
      }

      Meter {
        visible: stats.load !== null
        label: stats.cores > 0 ? "Load · " + stats.cores + " cores" : "Load"
        value: stats.load ? Model.load(stats.load.one) : ""
        fraction: root.loadFraction
        detail: stats.load ? Model.load(stats.load.five) + " over 5 min · "
          + Model.load(stats.load.fifteen) + " over 15 min" : ""
        tone: root.usageTone(root.loadFraction)
      }
    }

    Section {
      title: "Temperatures"
      visible: stats.cpuTemperature >= 0 || stats.gpuTemperature >= 0

      Meter {
        visible: stats.cpuTemperature >= 0
        label: "CPU"
        value: root.degrees(stats.cpuTemperature)
        fraction: stats.cpuTemperature / 100
        tone: root.temperatureTone(stats.cpuTemperature, 80, 90)
      }

      Meter {
        visible: stats.gpuTemperature >= 0
        label: "GPU"
        value: root.degrees(stats.gpuTemperature)
        fraction: stats.gpuTemperature / 100
        tone: root.temperatureTone(stats.gpuTemperature, 80, 90)
      }
    }

    Section {
      title: "Memory"
      visible: root.memory !== null

      Meter {
        label: "RAM"
        value: root.memory ? root.percent(root.ramFraction) : ""
        fraction: root.ramFraction
        detail: root.memory ? Model.gib(root.memory.used) + " of " + Model.gib(root.memory.total) : ""
        tone: root.usageTone(root.ramFraction)
      }

      Meter {
        visible: root.memory !== null && root.memory.swapTotal > 0
        label: "Swap"
        value: root.percent(root.swapFraction)
        fraction: root.swapFraction
        detail: root.memory && root.memory.swapTotal
          ? Model.gib(root.memory.swapUsed) + " of " + Model.gib(root.memory.swapTotal) : ""
        tone: root.usageTone(root.swapFraction)
      }
    }

    // One section per physical drive: its mounted filesystems with usage,
    // then swap and unmounted partitions in a line each.
    Repeater {
      model: stats.drives.length

      Section {
        id: drive

        required property int index
        readonly property var entry: stats.drives[index] || ({
          name: "", model: "", size: 0, temperature: -1, filesystems: [], swap: [], unmounted: []
        })

        title: entry.model || entry.name
        status: entry.temperature >= 0 ? root.degrees(entry.temperature) : ""
        statusTone: entry.temperature >= 0 ? root.temperatureTone(entry.temperature, 70, 80) : ""
        named: true

        Label {
          Layout.fillWidth: true
          text: Model.driveSummary(drive.entry)
          muted: true
          small: true
        }

        Repeater {
          model: drive.entry.filesystems.length

          Meter {
            required property int index
            readonly property var fs: drive.entry.filesystems[index] || ({ mounts: [], total: 1, used: 0 })
            readonly property real usage: fs.total > 0 ? fs.used / fs.total : 0

            label: fs.mounts.join(", ")
            value: root.percent(usage)
            fraction: usage
            detail: Model.filesystemDetail(fs)
            tone: root.usageTone(usage)
          }
        }

        Label {
          Layout.fillWidth: true
          visible: drive.entry.swap.length > 0
          text: "Swap: " + Model.swapList(drive.entry)
          muted: true
          small: true
          wrapMode: Text.Wrap
        }

        Label {
          Layout.fillWidth: true
          visible: drive.entry.unmounted.length > 0
          text: "Not mounted: " + Model.unmountedList(drive.entry)
          muted: true
          small: true
          wrapMode: Text.Wrap
        }
      }
    }
  }
}

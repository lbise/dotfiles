import QtQuick
import Quickshell.Services.UPower

// Battery percentage, shown only when a battery is present.
BarButton {
  id: root

  readonly property var device: UPower.displayDevice
  readonly property int percentage: device && device.isPresent ? Math.round(device.percentage * 100) : -1
  readonly property bool charging: UPower.onBattery === false

  visible: percentage >= 0
  icon: charging ? Icons.charging : ""
  label: percentage + "%"
  tone: charging ? "accent" : percentage >= 0 && percentage <= 15 ? "alert" : ""
}

import QtQuick
import Quickshell
import Quickshell.Services.UPower

Item {
  id: root

  property color foreground: "white"
  property color accent: foreground
  property string fontFamily: "monospace"

  readonly property var device: UPower.displayDevice
  readonly property int percentage: device && device.isPresent ? Math.round(device.percentage * 100) : -1
  readonly property bool charging: UPower.onBattery === false

  visible: percentage >= 0
  implicitWidth: visible ? label.implicitWidth + 20 : 0
  implicitHeight: visible ? 30 : 0

  Text {
    id: label
    anchors.centerIn: parent
    text: root.percentage < 0 ? "" : (root.charging ? "󰂄 " : "") + root.percentage + "%"
    color: root.charging ? root.accent : root.foreground
    font.family: root.fontFamily
    font.pixelSize: 12
  }
}

import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Bluetooth

// Bluetooth in the bar. The popup lists connected and paired devices with
// their battery, and can scan for new ones while it is open.
BarButton {
  id: root

  readonly property var adapter: Bluetooth.defaultAdapter
  readonly property bool enabled: adapter !== null && adapter.enabled
  readonly property var devices: Bluetooth.devices ? Bluetooth.devices.values : []
  readonly property var connected: devices.filter(function(d) { return d.connected })
  readonly property var paired: devices.filter(function(d) { return d.paired && !d.connected })
  readonly property var nearby: devices.filter(function(d) { return !d.paired && !d.connected && d.name && d.name !== d.address })

  icon: !enabled ? Icons.bluetoothOff : connected.length ? Icons.bluetoothConnected : Icons.bluetooth
  tone: enabled ? "" : "dim"
  open: popup.shown
  onClicked: function(button) {
    if (button === Qt.MiddleButton) openSettings()
    else Popups.toggle("bluetooth", popup.screenName)
  }

  function openSettings() {
    Popups.close()
    Quickshell.execDetached(["system-exec-term.sh", "bluetui"])
  }

  function kind(device) {
    var icon = String(device.icon || "")
    if (icon.indexOf("headset") !== -1) return { name: "Headset", glyph: Icons.headset }
    if (icon.indexOf("headphone") !== -1 || icon.indexOf("audio") !== -1) return { name: "Headphones", glyph: Icons.headphones }
    if (icon.indexOf("mouse") !== -1) return { name: "Mouse", glyph: Icons.mouse }
    if (icon.indexOf("keyboard") !== -1) return { name: "Keyboard", glyph: Icons.keyboard }
    if (icon.indexOf("phone") !== -1) return { name: "Phone", glyph: Icons.phone }
    if (icon.indexOf("gaming") !== -1) return { name: "Controller", glyph: Icons.gamepad }
    if (icon.indexOf("computer") !== -1) return { name: "Computer", glyph: Icons.laptop }
    return { name: "Device", glyph: Icons.devices }
  }

  function describe(device) {
    var text = kind(device).name
    if (device.batteryAvailable) text += " · battery " + Math.round(device.battery * 100) + "%"
    return text
  }

  function busyText(device) {
    if (device.pairing) return "Pairing…"
    var state = device.state
    if (state === BluetoothDeviceState.Connecting) return "Connecting…"
    if (state === BluetoothDeviceState.Disconnecting) return "Disconnecting…"
    return ""
  }

  Connections {
    target: popup
    function onShownChanged() {
      if (!popup.shown && root.adapter && root.adapter.discovering) root.adapter.discovering = false
    }
  }

  PopupCard {
    id: popup
    popupId: "bluetooth"
    anchorItem: root
    cardWidth: 340
    title: "Bluetooth"
    subtitle: !root.adapter ? "No adapter found"
      : !root.enabled ? "Off"
      : root.connected.length === 0 ? "No device connected"
      : root.connected.length === 1 ? "1 device connected"
      : root.connected.length + " devices connected"

    tools: [
      Toggle {
        anchors.verticalCenter: parent ? parent.verticalCenter : undefined
        visible: root.adapter !== null
        checked: root.enabled
        onToggled: root.adapter.enabled = !root.adapter.enabled
      }
    ]

    Section {
      title: "Connected"
      list: true
      visible: root.enabled && root.connected.length > 0

      Repeater {
        model: root.connected

        ListRow {
          required property var modelData
          icon: root.kind(modelData).glyph
          title: modelData.name || modelData.address
          subtitle: root.describe(modelData)
          active: true
          trailing: root.busyText(modelData) || "Disconnect"
          onClicked: modelData.disconnect()
        }
      }
    }

    Section {
      title: "Paired"
      list: true
      visible: root.enabled && root.paired.length > 0

      Repeater {
        model: root.paired

        ListRow {
          required property var modelData
          icon: root.kind(modelData).glyph
          title: modelData.name || modelData.address
          subtitle: root.describe(modelData)
          trailing: root.busyText(modelData) || "Connect"
          onClicked: modelData.connect()
        }
      }
    }

    Section {
      title: "Nearby"
      list: true
      visible: root.enabled && root.adapter.discovering

      Repeater {
        model: root.nearby

        ListRow {
          required property var modelData
          icon: root.kind(modelData).glyph
          title: modelData.name
          subtitle: root.kind(modelData).name
          trailing: root.busyText(modelData) || "Pair"
          onClicked: modelData.pair()
        }
      }

      Label {
        visible: root.nearby.length === 0
        Layout.margins: 8
        text: "Looking for devices…"
        muted: true
      }
    }

    Label {
      Layout.leftMargin: 10
      visible: root.enabled && root.devices.length === 0 && !root.adapter.discovering
      text: "No devices yet. Scan to find one."
      muted: true
    }

    Label {
      Layout.leftMargin: 10
      visible: root.adapter !== null && !root.enabled
      text: "Turn Bluetooth on to see your devices."
      muted: true
    }

    footer: [
      PillButton {
        visible: root.enabled
        text: root.adapter && root.adapter.discovering ? "Stop scanning" : "Scan"
        onClicked: root.adapter.discovering = !root.adapter.discovering
      },
      PillButton {
        text: "Settings"
        icon: Icons.cog
        onClicked: root.openSettings()
      }
    ]
  }
}

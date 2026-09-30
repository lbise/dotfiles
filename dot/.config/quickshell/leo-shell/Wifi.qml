pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import "WifiModel.js" as Model

// Network in the bar, read from nmcli. Shows Wi-Fi signal, or ethernet when
// the machine is wired and Wi-Fi is not connected. The popup shows the
// connection and lists nearby Wi-Fi networks; middle-click opens impala.
BarButton {
  id: root

  property var networks: []
  // The list the popup shows. Frozen while a network is selected or
  // connecting so the password field is not rebuilt under the cursor.
  property var shownNetworks: []
  property var devices: ({ wifiDevice: null, wifi: null, ethernet: null })
  property var connectionDetails: ({ address: "", gateway: "", speed: "" })
  property bool radioEnabled: true
  property bool scanning: false
  property bool scanFailed: false
  property bool connecting: false
  property string pendingSsid: ""
  property string selectedSsid: ""
  property string connectError: ""

  readonly property bool hasWifi: devices.wifiDevice !== null
  readonly property var connectedNetwork: {
    for (var i = 0; i < networks.length; i++)
      if (networks[i].inUse) return networks[i]
    return null
  }
  readonly property var primaryDevice: devices.wifi || devices.ethernet
  readonly property var nearby: shownNetworks.filter(function(n) { return !n.inUse })

  icon: devices.wifi ? signalIcon(connectedNetwork ? connectedNetwork.signal : 100)
    : devices.ethernet ? Icons.ethernet
    : Icons.wifiOff
  tone: primaryDevice ? "" : "dim"
  open: popup.shown

  onClicked: function(button) {
    if (button === Qt.MiddleButton) {
      Popups.close()
      Quickshell.execDetached(["system-exec-term.sh", "impala"])
    } else {
      Popups.toggle("wifi", popup.screenName)
    }
  }

  Component.onCompleted: refresh()

  function signalIcon(signal) {
    var level = Model.signalLevel(signal)
    return level === 4 ? Icons.wifi4 : level === 3 ? Icons.wifi3 : level === 2 ? Icons.wifi2 : Icons.wifi1
  }

  function describe(network) {
    return [network.signal + "%", String(network.rate).replace("Mbit/s", "Mb/s"), network.security].join(" · ")
  }

  function openWifi() {
    connectError = ""
    refresh()
    scan()
  }

  function closeWifi() {
    selectedSsid = ""
    connectError = ""
    showNetworks()
  }

  function refresh() {
    if (!listProcess.running) listProcess.running = true
    if (!statusProcess.running) statusProcess.running = true
    if (!radioProcess.running) radioProcess.running = true
  }

  function scan() {
    if (scanProcess.running || !hasWifi || !radioEnabled) return
    scanning = true
    scanFailed = false
    scanProcess.running = true
  }

  function setRadio(on) {
    if (radioSetProcess.running) return
    radioEnabled = on
    if (!on) {
      networks = []
      showNetworks()
    }
    radioSetProcess.command = ["nmcli", "radio", "wifi", on ? "on" : "off"]
    radioSetProcess.running = true
  }

  function chooseNetwork(network) {
    if (!network || network.inUse || network.hidden || connecting) return
    connectError = ""
    if (selectedSsid === network.ssid) {
      cancelSelection()
    } else if (network.security === "Open") {
      selectedSsid = ""
      connect(network.ssid, "")
    } else {
      selectedSsid = network.ssid
    }
  }

  function cancelSelection() {
    selectedSsid = ""
    connectError = ""
    showNetworks()
  }

  function connect(ssid, password) {
    if (!ssid || connecting) return
    connecting = true
    pendingSsid = ssid
    connectError = ""
    var command = ["nmcli", "device", "wifi", "connect", ssid]
    if (password !== "") command.push("password", password)
    connectProcess.command = command
    connectProcess.running = true
  }

  function showNetworks() {
    if (selectedSsid !== "" || connecting) return
    var next = Model.uniqueNetworks(networks)
    if (JSON.stringify(next) !== JSON.stringify(shownNetworks)) shownNetworks = next
  }

  function applyNetworks(output) {
    networks = Model.parseNetworks(output)
    showNetworks()
  }

  function applyDeviceStatus(output) {
    devices = Model.summarizeDevices(output)
    var device = devices.wifi || devices.ethernet
    if (device) {
      detailProcess.command = [
        "nmcli", "-t", "-f", "IP4.ADDRESS,IP4.GATEWAY,CAPABILITIES.SPEED",
        "device", "show", device.device
      ]
      if (!detailProcess.running) detailProcess.running = true
    } else {
      connectionDetails = ({ address: "", gateway: "", speed: "" })
    }
  }

  function applyDetails(output) {
    connectionDetails = Model.parseDetails(output)
  }

  Process {
    id: listProcess
    // In the background, read the cached list instead of triggering a scan.
    command: [
      "nmcli", "-t", "-f", "IN-USE,SSID,CHAN,RATE,SIGNAL,BARS,SECURITY",
      "device", "wifi", "list"
    ].concat(popup.shown ? [] : ["--rescan", "no"])
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.applyNetworks(text)
    }
    stderr: StdioCollector { waitForEnd: true }
  }

  Process {
    id: statusProcess
    command: ["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.applyDeviceStatus(text)
    }
    stderr: StdioCollector { waitForEnd: true }
  }

  Process {
    id: detailProcess
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.applyDetails(text)
    }
    stderr: StdioCollector { waitForEnd: true }
  }

  Process {
    id: radioProcess
    command: ["nmcli", "radio", "wifi"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        if (!radioSetProcess.running) root.radioEnabled = text.trim() !== "disabled"
      }
    }
    stderr: StdioCollector { waitForEnd: true }
  }

  Process {
    id: radioSetProcess
    stderr: StdioCollector { waitForEnd: true }
    onExited: function(exitCode, exitStatus) {
      refreshTimer.restart()
      if (exitCode === 0 && root.radioEnabled && popup.shown) scanDelay.restart()
    }
  }

  Process {
    id: scanProcess
    command: ["nmcli", "device", "wifi", "rescan"]
    stderr: StdioCollector { waitForEnd: true }
    onExited: function(exitCode, exitStatus) {
      root.scanning = false
      root.scanFailed = exitCode !== 0
      refreshTimer.restart()
    }
  }

  Process {
    id: connectProcess
    stderr: StdioCollector {
      id: connectErrorText
      waitForEnd: true
    }
    onExited: function(exitCode, exitStatus) {
      root.connecting = false
      if (exitCode === 0) {
        root.pendingSsid = ""
        root.selectedSsid = ""
        root.connectError = ""
        refreshTimer.restart()
      } else {
        // Keep the row open so the error shows next to it.
        root.selectedSsid = root.pendingSsid
        root.pendingSsid = ""
        var message = String(connectErrorText.text || "").trim().replace(/^Error: /, "") || "Could not connect"
        root.connectError = message.length > 100 ? message.slice(0, 100) + "…" : message
      }
    }
  }

  Timer {
    id: refreshTimer
    interval: 700
    onTriggered: root.refresh()
  }

  // The radio takes a moment to come up before it can scan.
  Timer {
    id: scanDelay
    interval: 1500
    onTriggered: root.scan()
  }

  Timer {
    id: pollTimer
    interval: 3000
    repeat: true
    running: popup.shown
    onTriggered: root.refresh()
  }

  // Keeps the bar icon current while the popup is closed.
  Timer {
    interval: 15000
    repeat: true
    running: !popup.shown
    onTriggered: root.refresh()
  }

  Connections {
    target: popup
    function onShownChanged() {
      if (!popup.shown) root.closeWifi()
    }
  }

  PopupCard {
    id: popup
    popupId: "wifi"
    anchorItem: root
    align: "right"
    cardWidth: 380
    maxBodyHeight: 560
    title: root.devices.wifi || !root.devices.ethernet ? "Wi-Fi" : "Network"
    subtitle: root.primaryDevice ? root.primaryDevice.device : "Not connected"

    onOpened: root.openWifi()

    tools: [
      IconButton {
        anchors.verticalCenter: parent ? parent.verticalCenter : undefined
        visible: root.hasWifi && root.radioEnabled
        icon: Icons.refresh
        busy: root.scanning
        onClicked: root.scan()
      },
      Toggle {
        anchors.verticalCenter: parent ? parent.verticalCenter : undefined
        visible: root.hasWifi
        checked: root.radioEnabled
        onToggled: root.setRadio(!root.radioEnabled)
      }
    ]

    Section {
      list: true

      ListRow {
        visible: root.devices.wifi !== null
        interactive: false
        active: true
        icon: root.connectedNetwork ? root.signalIcon(root.connectedNetwork.signal) : Icons.wifi4
        title: root.connectedNetwork ? root.connectedNetwork.ssid
          : root.devices.wifi ? root.devices.wifi.connection : ""
        subtitle: root.connectedNetwork ? root.describe(root.connectedNetwork) : ""
        trailing: "Connected"
      }

      ListRow {
        visible: root.devices.wifi === null && root.devices.ethernet !== null
        interactive: false
        active: true
        icon: Icons.ethernet
        title: root.devices.ethernet ? root.devices.ethernet.connection || "Wired" : ""
        subtitle: ["Ethernet", root.connectionDetails.speed].filter(function(s) { return s }).join(" · ")
        trailing: "Connected"
      }

      ListRow {
        visible: root.primaryDevice === null
        interactive: false
        icon: Icons.wifiOff
        title: "Not connected"
        subtitle: !root.hasWifi ? "No Wi-Fi device found"
          : !root.radioEnabled ? "Wi-Fi is off"
          : "Select a network below"
      }

      ColumnLayout {
        Layout.fillWidth: true
        Layout.leftMargin: 8
        Layout.rightMargin: 8
        Layout.topMargin: 4
        Layout.bottomMargin: 8
        visible: root.primaryDevice !== null
        spacing: 6

        KeyValue {
          key: "Address"
          value: root.connectionDetails.address || "-"
        }

        KeyValue {
          key: "Gateway"
          value: root.connectionDetails.gateway || "-"
        }
      }
    }

    Section {
      title: "Networks nearby"
      list: true
      visible: root.hasWifi

      Label {
        Layout.margins: 8
        visible: root.scanFailed
        text: "Wi-Fi scan failed"
        color: Theme.alert
      }

      Label {
        Layout.margins: 8
        visible: !root.radioEnabled
        text: "Turn Wi-Fi on to see networks."
        muted: true
      }

      Label {
        Layout.margins: 8
        visible: root.radioEnabled && root.nearby.length === 0 && !root.scanFailed
        text: root.scanning ? "Scanning…" : "No networks found"
        muted: true
      }

      Repeater {
        model: root.radioEnabled ? root.nearby : []

        ListRow {
          id: row
          required property var modelData
          readonly property bool secured: modelData.security !== "Open"
          readonly property bool chosen: root.selectedSsid === modelData.ssid

          icon: root.signalIcon(modelData.signal)
          title: modelData.ssid
          subtitle: root.describe(modelData)
          trailing: root.pendingSsid === modelData.ssid ? "Connecting…" : ""
          trailingIcon: secured ? Icons.lock : ""
          interactive: !modelData.hidden && !root.connecting
          selected: chosen
          expanded: chosen
          onClicked: root.chooseNetwork(modelData)

          onChosenChanged: {
            if (chosen && secured) Qt.callLater(password.focusInput)
            if (!chosen) password.text = ""
          }

          Keys.onEscapePressed: function(event) {
            if (!row.chosen) {
              event.accepted = false
              return
            }
            root.cancelSelection()
            row.forceActiveFocus()
          }

          InputField {
            id: password
            visible: row.secured
            label: "Password for " + row.modelData.ssid
            password: true
            onAccepted: if (text !== "") root.connect(row.modelData.ssid, text)
          }

          Label {
            Layout.fillWidth: true
            visible: root.connectError !== ""
            text: root.connectError
            color: Theme.alert
            small: true
            wrapMode: Text.Wrap
            elide: Text.ElideNone
          }

          RowLayout {
            Layout.fillWidth: true
            spacing: 6

            Item { Layout.fillWidth: true }

            PillButton {
              text: "Cancel"
              onClicked: root.cancelSelection()
            }

            PillButton {
              text: root.connecting ? "Connecting…" : "Connect"
              kind: "primary"
              enabled: !root.connecting && (!row.secured || password.text !== "")
              onClicked: root.connect(row.modelData.ssid, row.secured ? password.text : "")
            }
          }
        }
      }
    }
  }
}

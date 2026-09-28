pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import "WifiModel.js" as Model

Item {
  id: root

  property color foreground: "white"
  property color background: "#222831"
  property string fontFamily: "monospace"
  property bool popupOpen: false
  property var networks: []
  property var connectedDevice: null
  property var connectionDetails: ({ address: "", gateway: "" })
  property bool scanning: false
  property bool connecting: false
  property string selectedSsid: ""
  property string passwordText: ""
  property string errorMessage: ""

  readonly property var connectedNetwork: {
    for (var i = 0; i < networks.length; i++)
      if (networks[i].inUse) return networks[i]
    return null
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function openWifi() {
    popupOpen = true
    errorMessage = ""
    refresh()
    scan()
  }

  function closeWifi() {
    popupOpen = false
    selectedSsid = ""
    passwordText = ""
    errorMessage = ""
  }

  function refresh() {
    if (!listProcess.running) listProcess.running = true
    if (!statusProcess.running) statusProcess.running = true
  }

  function scan() {
    if (scanProcess.running) return
    scanning = true
    scanProcess.running = true
  }

  function chooseNetwork(network) {
    if (!network || network.inUse || connecting) return
    errorMessage = ""
    if (network.security === "Open") {
      connect(network.ssid, "")
    } else {
      selectedSsid = network.ssid
      passwordText = ""
      passwordField.forceActiveFocus()
    }
  }

  function connect(ssid, password) {
    if (!ssid || connecting) return
    connecting = true
    errorMessage = ""
    connectProcess.command = ["nmcli", "device", "wifi", "connect", ssid]
    if (password !== "") connectProcess.command.push("password", password)
    connectProcess.running = true
  }

  function applyNetworks(output) {
    networks = Model.parseNetworks(output)
  }

  function applyDeviceStatus(output) {
    connectedDevice = Model.parseDeviceStatus(output)
    if (connectedDevice) {
      detailProcess.command = [
        "nmcli", "-t", "-f", "IP4.ADDRESS,IP4.GATEWAY",
        "device", "show", connectedDevice.device
      ]
      if (!detailProcess.running) detailProcess.running = true
    } else {
      connectionDetails = ({ address: "", gateway: "" })
    }
  }

  function applyDetails(output) {
    connectionDetails = Model.parseDetails(output)
  }

  Button {
    id: button
    anchors.fill: parent
    label: root.connectedNetwork ? "" : "󰤮"
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: function(mouseButton) {
      if (mouseButton === Qt.MiddleButton) {
        Quickshell.execDetached(["system-exec-term.sh", "impala"])
      } else {
        root.openWifi()
      }
    }
  }

  Process {
    id: listProcess
    command: [
      "nmcli", "-t", "-f", "IN-USE,SSID,CHAN,RATE,SIGNAL,BARS,SECURITY",
      "device", "wifi", "list"
    ]
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
    id: scanProcess
    command: ["nmcli", "device", "wifi", "rescan"]
    stderr: StdioCollector { waitForEnd: true }
    onExited: function(exitCode, exitStatus) {
      root.scanning = false
      if (exitCode !== 0) root.errorMessage = "Wi-Fi scan failed"
      refreshTimer.restart()
    }
  }

  Process {
    id: connectProcess
    stderr: StdioCollector {
      id: connectError
      waitForEnd: true
    }
    onExited: function(exitCode, exitStatus) {
      root.connecting = false
      if (exitCode === 0) {
        root.selectedSsid = ""
        root.passwordText = ""
        refreshTimer.restart()
      } else {
        root.errorMessage = String(connectError.text || "Could not connect").trim()
        if (root.errorMessage.length > 100) root.errorMessage = root.errorMessage.slice(0, 100) + "…"
      }
    }
  }

  Timer {
    id: refreshTimer
    interval: 700
    onTriggered: root.refresh()
  }

  Timer {
    id: pollTimer
    interval: 3000
    repeat: true
    running: root.popupOpen
    onTriggered: root.refresh()
  }

  PopupWindow {
    id: popup
    visible: root.popupOpen
    grabFocus: true
    color: "transparent"
    implicitWidth: 410
    implicitHeight: 500

    onVisibleChanged: {
      if (!visible) root.closeWifi()
      else card.forceActiveFocus()
    }

    anchor {
      window: root.QsWindow.window
      adjustment: PopupAdjustment.Slide
      edges: Edges.Top | Edges.Left
      gravity: Edges.Bottom | Edges.Right
      rect.width: 1
      rect.height: 1

      onAnchoring: {
        var window = root.QsWindow.window
        if (!window) return
        var point = window.contentItem.mapFromItem(root, 0, root.height + 4)
        popup.anchor.rect.x = Math.round(point.x)
        popup.anchor.rect.y = Math.round(point.y)
      }
    }

    Rectangle {
      id: card
      anchors.fill: parent
      radius: 6
      color: root.background
      border.color: root.foreground
      border.width: 1
      focus: true
      Keys.onEscapePressed: root.closeWifi()

      ColumnLayout {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 10

        RowLayout {
          Layout.fillWidth: true
          Text {
            Layout.fillWidth: true
            text: "Wi-Fi"
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: 15
            font.bold: true
          }
          Button {
            label: root.scanning ? "…" : "↻"
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: root.scan()
          }
        }

        Rectangle {
          Layout.fillWidth: true
          implicitHeight: 76
          radius: 4
          color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08)

          ColumnLayout {
            anchors.fill: parent
            anchors.margins: 10
            spacing: 4
            Text {
              Layout.fillWidth: true
              text: root.connectedNetwork ? root.connectedNetwork.ssid : "Not connected"
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: 13
              font.bold: true
              elide: Text.ElideRight
            }
            Text {
              Layout.fillWidth: true
              text: root.connectedNetwork
                ? root.connectedNetwork.signal + "% signal  ·  " + root.connectedNetwork.rate
                : "Select a network below"
              color: root.foreground
              opacity: 0.8
              font.family: root.fontFamily
              font.pixelSize: 11
            }
            Text {
              Layout.fillWidth: true
              visible: root.connectedDevice !== null
              text: root.connectionDetails.address
                + (root.connectionDetails.gateway ? "  ·  gateway " + root.connectionDetails.gateway : "")
              color: root.foreground
              opacity: 0.65
              font.family: root.fontFamily
              font.pixelSize: 10
              elide: Text.ElideRight
            }
          }
        }

        Text {
          Layout.fillWidth: true
          text: root.scanning ? "Scanning for networks…" : "Reachable networks"
          color: root.foreground
          opacity: 0.75
          font.family: root.fontFamily
          font.pixelSize: 11
        }

        Flickable {
          id: networkList
          Layout.fillWidth: true
          Layout.fillHeight: true
          clip: true
          contentHeight: networkColumn.implicitHeight
          boundsBehavior: Flickable.StopAtBounds

          Column {
            id: networkColumn
            width: networkList.width
            spacing: 3

            Repeater {
              model: root.networks

              Rectangle {
                required property var modelData
                width: networkColumn.width
                height: 42
                radius: 4
                color: networkMouse.containsMouse
                  ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
                  : "transparent"

                Text {
                  anchors.left: parent.left
                  anchors.leftMargin: 8
                  anchors.verticalCenter: parent.verticalCenter
                  width: parent.width - 100
                  text: modelData.ssid + "\n" + modelData.signal + "%  ·  " + modelData.rate + "  ·  " + modelData.security
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: 11
                  elide: Text.ElideRight
                }
                Text {
                  anchors.right: parent.right
                  anchors.rightMargin: 8
                  anchors.verticalCenter: parent.verticalCenter
                  text: modelData.inUse ? "Connected" : modelData.bars
                  color: root.foreground
                  opacity: modelData.inUse ? 1 : 0.7
                  font.family: root.fontFamily
                  font.pixelSize: 10
                }
                MouseArea {
                  id: networkMouse
                  anchors.fill: parent
                  hoverEnabled: true
                  enabled: !modelData.inUse && !root.connecting
                  onClicked: root.chooseNetwork(modelData)
                }
              }
            }
          }
        }

        RowLayout {
          visible: root.selectedSsid !== ""
          Layout.fillWidth: true
          spacing: 6

          Text {
            text: root.selectedSsid
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: 11
            elide: Text.ElideRight
            Layout.maximumWidth: 100
          }
          Rectangle {
            Layout.fillWidth: true
            implicitHeight: 30
            radius: 4
            color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08)
            border.color: root.foreground
            border.width: 1
            TextInput {
              id: passwordField
              anchors.fill: parent
              anchors.leftMargin: 8
              anchors.rightMargin: 8
              verticalAlignment: TextInput.AlignVCenter
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: 11
              echoMode: TextInput.Password
              clip: true
              onTextChanged: root.passwordText = text
            }
          }
          Button {
            label: root.connecting ? "…" : "Connect"
            foreground: root.foreground
            fontFamily: root.fontFamily
            enabled: root.passwordText.length > 0 && !root.connecting
            onClicked: root.connect(root.selectedSsid, root.passwordText)
          }
        }

        Text {
          Layout.fillWidth: true
          visible: root.errorMessage !== ""
          text: root.errorMessage
          color: "#e06c75"
          font.family: root.fontFamily
          font.pixelSize: 10
          wrapMode: Text.Wrap
        }
      }
    }
  }
}

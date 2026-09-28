import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io

Item {
  id: root

  property color foreground: "white"
  property color muted: foreground
  property color accent: foreground
  property string fontFamily: "monospace"
  property int currentWorkspaceId: 0

  readonly property var workspaceNumbers: [1, 2, 3, 4, 5, 6, 7, 8]

  implicitWidth: row.implicitWidth
  implicitHeight: row.implicitHeight

  function updateCurrentWorkspace(output) {
    try {
      var workspace = JSON.parse(output)
      if (workspace && workspace.id !== undefined) currentWorkspaceId = Number(workspace.id)
    } catch (error) {
      // Keep the previous value if hyprctl returns incomplete output.
    }
  }

  function refreshCurrentWorkspace() {
    if (!activeWorkspaceProcess.running) activeWorkspaceProcess.running = true
  }

  function workspaceById(id) {
    var values = Hyprland.workspaces.values
    for (var i = 0; i < values.length; i++) {
      if (values[i].id === id) return values[i]
    }
    return null
  }

  Process {
    id: activeWorkspaceProcess
    command: ["hyprctl", "activeworkspace", "-j"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.updateCurrentWorkspace(text)
    }
  }

  Timer {
    interval: 250
    repeat: true
    running: true
    onTriggered: root.refreshCurrentWorkspace()
  }

  Component.onCompleted: root.refreshCurrentWorkspace()

  RowLayout {
    id: row
    anchors.fill: parent
    spacing: 1

    Repeater {
      model: root.workspaceNumbers

      Button {
        required property int modelData

        readonly property var workspace: root.workspaceById(modelData)
        readonly property bool focused: root.currentWorkspaceId === modelData
        readonly property bool occupied: workspace !== null
          && workspace.toplevels.values.length > 0

        label: String(modelData)
        foreground: focused ? root.accent : occupied ? root.foreground : root.muted
        fillColor: focused
          ? Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.13)
          : "transparent"
        fontFamily: root.fontFamily
        horizontalPadding: 8
        Layout.fillHeight: true

        Rectangle {
          anchors.horizontalCenter: parent.horizontalCenter
          anchors.bottom: parent.bottom
          width: 12
          height: 2
          radius: 1
          color: root.accent
          visible: parent.focused
        }

        onClicked: Quickshell.execDetached([
          "hyprctl", "dispatch", "workspace", String(modelData)
        ])
      }
    }
  }
}

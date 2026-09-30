import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Hyprland

// Workspaces 1 to 8. The current one is accent with an underline; occupied
// ones use the text colour and empty ones are muted.
RowLayout {
  id: root

  readonly property var workspaceNumbers: [1, 2, 3, 4, 5, 6, 7, 8]
  readonly property int currentId: Hyprland.focusedWorkspace ? Hyprland.focusedWorkspace.id : 0

  spacing: 1

  function workspaceById(id) {
    var values = Hyprland.workspaces.values
    for (var i = 0; i < values.length; i++) {
      if (values[i].id === id) return values[i]
    }
    return null
  }

  Repeater {
    model: root.workspaceNumbers

    BarButton {
      id: button
      required property int modelData

      readonly property var workspace: root.workspaceById(modelData)
      readonly property bool focused: root.currentId === modelData
      readonly property bool occupied: workspace !== null && workspace.toplevels.values.length > 0

      label: String(modelData)
      tone: focused ? "accent" : occupied ? "" : "dim"
      restColor: focused ? Theme.alpha(Theme.accent, 0.14) : "transparent"
      horizontalPadding: 8
      Layout.preferredWidth: Math.max(implicitWidth, 26)

      Rectangle {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 2
        width: 12
        height: 2
        radius: 1
        color: Theme.accent
        visible: button.focused
      }

      onClicked: Hyprland.dispatch("workspace " + modelData)
      onWheel: function(delta) { Hyprland.dispatch(delta > 0 ? "workspace e-1" : "workspace e+1") }
    }
  }
}

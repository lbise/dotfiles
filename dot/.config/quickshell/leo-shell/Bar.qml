import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland

// A floating bar: the layer surface spans the top edge, and the visible bar
// is inset by Theme.gap on the sides and Theme.barInset from the top. The
// reserved zone covers the inset plus the bar, so Hyprland's own gaps_out
// puts windows the same distance below the bar as they sit from the sides.
PanelWindow {
  id: root

  required property var output

  screen: output
  anchors {
    top: true
    left: true
    right: true
  }
  implicitHeight: Theme.barInset + Theme.barHeight
  color: "transparent"
  exclusionMode: ExclusionMode.Auto
  WlrLayershell.namespace: "leo-bar"
  WlrLayershell.layer: WlrLayer.Top
  // Only the bar itself takes input; the transparent strip around it does not.
  mask: Region { item: bar }

  Rectangle {
    id: bar

    x: Theme.gap
    y: Theme.barInset
    width: parent.width - Theme.gap * 2
    height: Theme.barHeight
    radius: Theme.radius + 3
    color: Theme.background
    border.width: 1
    border.color: Theme.rule

    RowLayout {
      anchors.left: parent.left
      anchors.leftMargin: 4
      anchors.verticalCenter: parent.verticalCenter
      spacing: 6

      Menu {}
      Workspaces {}
    }

    Clock {
      anchors.centerIn: parent
    }

    RowLayout {
      anchors.right: parent.right
      anchors.rightMargin: 4
      anchors.verticalCenter: parent.verticalCenter
      spacing: 1

      Media {}
      KeepAwake {}
      AiUsage {}
      SystemStats {}

      Rectangle {
        Layout.leftMargin: 8
        Layout.rightMargin: 8
        implicitWidth: 1
        implicitHeight: 14
        color: Theme.rule
      }

      Printers {}
      Bluetooth {}
      Audio {}
      Wifi {}
      Battery {}
      Notifications {}
      Tray {
        Layout.leftMargin: 4
      }
    }
  }
}

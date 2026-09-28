import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland

PanelWindow {
  id: root

  required property var output
  required property var shellTheme

  screen: output
  anchors {
    top: true
    left: true
    right: true
  }
  implicitHeight: shellTheme.barHeight
  color: shellTheme.background
  exclusionMode: ExclusionMode.Auto
  WlrLayershell.namespace: "leo-bar"
  WlrLayershell.layer: WlrLayer.Top

  Rectangle {
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.bottom: parent.bottom
    height: 1
    color: root.shellTheme.rule
  }

  RowLayout {
    anchors.left: parent.left
    anchors.leftMargin: 10
    anchors.verticalCenter: parent.verticalCenter
    spacing: 8

    Menu {
      foreground: root.shellTheme.foreground
      background: root.shellTheme.background
      fontFamily: root.shellTheme.fontFamily
    }

    Workspaces {
      foreground: root.shellTheme.foreground
      muted: root.shellTheme.muted
      accent: root.shellTheme.accent
      fontFamily: root.shellTheme.fontFamily
    }
  }

  Clock {
    anchors.horizontalCenter: parent.horizontalCenter
    anchors.verticalCenter: parent.verticalCenter
    foreground: root.shellTheme.foreground
    fontFamily: root.shellTheme.fontFamily
  }

  RowLayout {
    anchors.right: parent.right
    anchors.rightMargin: 10
    anchors.verticalCenter: parent.verticalCenter
    spacing: 1

    AiUsage {
      foreground: root.shellTheme.foreground
      background: root.shellTheme.background
      fontFamily: root.shellTheme.fontFamily
    }

    SystemStats {
      foreground: root.shellTheme.foreground
      background: root.shellTheme.background
      fontFamily: root.shellTheme.fontFamily
    }

    Divider {}

    Printers {
      foreground: root.shellTheme.foreground
      background: root.shellTheme.background
      accent: root.shellTheme.accent
      alert: root.shellTheme.alert
      fontFamily: root.shellTheme.fontFamily
    }

    Bluetooth {
      foreground: root.shellTheme.foreground
      background: root.shellTheme.background
      fontFamily: root.shellTheme.fontFamily
    }

    Audio {
      foreground: root.shellTheme.foreground
      background: root.shellTheme.background
      fontFamily: root.shellTheme.fontFamily
    }

    Wifi {
      foreground: root.shellTheme.foreground
      background: root.shellTheme.background
      fontFamily: root.shellTheme.fontFamily
    }

    Battery {
      foreground: root.shellTheme.foreground
      accent: root.shellTheme.accent
      fontFamily: root.shellTheme.fontFamily
    }

    Tray {
      Layout.leftMargin: 10
      foreground: root.shellTheme.foreground
      muted: root.shellTheme.muted
      background: root.shellTheme.background
      surface: root.shellTheme.surface
      accent: root.shellTheme.accent
      fontFamily: root.shellTheme.fontFamily
    }
  }

  component Divider: Rectangle {
    Layout.leftMargin: 9
    Layout.rightMargin: 9
    implicitWidth: 1
    implicitHeight: 14
    color: root.shellTheme.rule
  }
}

pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import "SystemStatsModel.js" as Model

Item {
  id: root

  property color foreground: "white"
  property color background: "#222831"
  property string fontFamily: "monospace"
  property bool popupOpen: false

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  SystemStatsData {
    id: stats
    running: root.popupOpen
  }

  Button {
    id: button
    anchors.fill: parent
    label: "󰍛"
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: root.popupOpen = !root.popupOpen
  }

  PopupWindow {
    id: popup
    visible: root.popupOpen
    grabFocus: true
    onVisibleChanged: {
      if (!visible) root.popupOpen = false
      else card.forceActiveFocus()
    }
    color: "transparent"
    implicitWidth: 340
    implicitHeight: content.implicitHeight + 32

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
        var point = window.contentItem.mapFromItem(root, root.width - popup.width, root.height + 4)
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
      Keys.onEscapePressed: root.popupOpen = false

      ColumnLayout {
        id: content
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: 16
        spacing: 16

        RowLayout {
          Layout.fillWidth: true
          Text {
            Layout.fillWidth: true
            text: "System stats"
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: 15
            font.bold: true
          }
          Button {
            label: "×"
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: root.popupOpen = false
          }
        }

        Metric {
          title: "CPU"
          value: stats.cpuUsage < 0 ? "Sampling…" : Math.round(stats.cpuUsage * 100) + "%"
          fraction: Math.max(0, stats.cpuUsage)
        }
        Metric {
          title: "RAM"
          value: stats.memory ? Math.round(fraction * 100) + "%" : "Unavailable"
          fraction: stats.memory ? stats.memory.used / stats.memory.total : 0
          detail: stats.memory ? Model.gib(stats.memory.used) + " / " + Model.gib(stats.memory.total) : ""
        }
        Metric {
          title: "Swap"
          value: !stats.memory ? "Unavailable" : stats.memory.swapTotal === 0 ? "Disabled" : Math.round(fraction * 100) + "%"
          fraction: stats.memory && stats.memory.swapTotal ? stats.memory.swapUsed / stats.memory.swapTotal : 0
          detail: stats.memory && stats.memory.swapTotal ? Model.gib(stats.memory.swapUsed) + " / " + Model.gib(stats.memory.swapTotal) : ""
        }
        Text {
          Layout.fillWidth: true
          text: "Load · 1 / 5 / 15 min\n" + stats.loadAverage
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: 12
        }
        Text {
          text: "Uptime  " + stats.uptime
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: 12
        }
      }
    }
  }

  component Metric: ColumnLayout {
    property string title
    property string value
    property string detail: ""
    property real fraction: 0
    id: metric
    Layout.fillWidth: true
    spacing: 6

    RowLayout {
      Layout.fillWidth: true
      Text {
        Layout.fillWidth: true
        text: metric.title
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: 13
      }
      Text {
        text: metric.value
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: 13
      }
    }
    Rectangle {
      Layout.fillWidth: true
      implicitHeight: 6
      radius: 3
      color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.15)
      Rectangle {
        width: parent.width * Math.max(0, Math.min(1, metric.fraction))
        height: parent.height
        radius: 3
        color: root.foreground
      }
    }
    Text {
      visible: metric.detail !== ""
      text: metric.detail
      color: root.foreground
      opacity: 0.7
      font.family: root.fontFamily
      font.pixelSize: 11
    }
  }
}

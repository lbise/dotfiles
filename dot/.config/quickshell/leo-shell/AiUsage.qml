pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import "AiUsageModel.js" as Model

Item {
  id: root

  property color foreground: "white"
  property color background: "#222831"
  property string fontFamily: "monospace"
  property bool popupOpen: false

  readonly property var providerRows: Model.recordRows(data.records)
  readonly property bool hasData: providerRows.length > 0
  readonly property real highestQuota: {
    var highest = 0
    for (var i = 0; i < providerRows.length; i++) {
      var limits = providerRows[i].limits
      for (var j = 0; j < limits.length; j++) highest = Math.max(highest, limits[j].percent)
    }
    return highest
  }

  implicitWidth: hasData ? button.implicitWidth : 0
  implicitHeight: hasData ? button.implicitHeight : 0
  visible: hasData

  AiUsageData {
    id: data
  }

  IpcHandler {
    target: "leo.ai-usage"
    function open(): void { root.openUsage() }
    function close(): void { root.popupOpen = false }
    function toggle(): void { root.popupOpen ? root.popupOpen = false : root.openUsage() }
    function refresh(): void { data.runUpdate(false) }
  }

  function statusText(record) {
    var status = String(record && record.usageStatusText || "")
    if (status === "Codex unavailable") return "Quota unavailable. Local token history is still shown."
    return status === "" ? "" : "Quota: " + status
  }

  function resetText(value) {
    if (!value) return ""
    var date = new Date(value)
    if (!isFinite(date.getTime())) return ""
    return "resets " + Qt.formatDateTime(date, "d MMM, HH:mm")
  }

  function openUsage() {
    popupOpen = true
    data.runUpdate(true)
  }

  Button {
    id: button
    anchors.fill: parent
    label: root.highestQuota > 0 ? "AI " + Model.formatPercent(root.highestQuota) : "AI"
    foreground: root.foreground
    fontFamily: root.fontFamily
    horizontalPadding: 8
    onClicked: root.openUsage()
  }

  PopupWindow {
    id: popup
    visible: root.popupOpen
    grabFocus: true
    color: "transparent"
    implicitWidth: 460
    implicitHeight: 570

    onVisibleChanged: {
      if (!visible) root.popupOpen = false
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
        anchors.fill: parent
        anchors.margins: 16
        spacing: 10

        RowLayout {
          Layout.fillWidth: true
          Text {
            Layout.fillWidth: true
            text: "AI usage"
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: 15
            font.bold: true
          }
          Button {
            label: data.refreshing ? "…" : "↻"
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: data.runUpdate(false)
          }
        }

        Flickable {
          id: providersFlickable
          Layout.fillWidth: true
          Layout.fillHeight: true
          clip: true
          contentHeight: providersColumn.implicitHeight
          boundsBehavior: Flickable.StopAtBounds

          Column {
            id: providersColumn
            width: providersFlickable.width
            spacing: 18

            Repeater {
              model: root.providerRows

              Column {
                required property var modelData
                width: providersColumn.width
                spacing: 8

                RowLayout {
                  width: parent.width
                  Text {
                    Layout.fillWidth: true
                    text: modelData.record.name || modelData.id
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: 14
                    font.bold: true
                  }
                  Text {
                    visible: !!modelData.record.tierLabel
                    text: modelData.record.tierLabel || ""
                    color: root.foreground
                    opacity: 0.7
                    font.family: root.fontFamily
                    font.pixelSize: 11
                  }
                }

                Text {
                  visible: !!modelData.record.usageStatusText
                  width: parent.width
                  text: root.statusText(modelData.record)
                  color: root.foreground
                  opacity: 0.7
                  font.family: root.fontFamily
                  font.pixelSize: 10
                  wrapMode: Text.Wrap
                }

                Repeater {
                  model: modelData.limits

                  Column {
                    required property var modelData
                    width: providersColumn.width
                    spacing: 4

                    RowLayout {
                      width: parent.width
                      Text {
                        Layout.fillWidth: true
                        text: modelData.label
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: 11
                      }
                      Text {
                        text: Model.formatPercent(modelData.percent)
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: 11
                      }
                    }
                    Rectangle {
                      width: parent.width
                      height: 5
                      radius: 3
                      color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.15)
                      Rectangle {
                        width: parent.width * modelData.percent
                        height: parent.height
                        radius: 3
                        color: root.foreground
                      }
                    }
                    Text {
                      visible: text !== ""
                      text: root.resetText(modelData.resetsAt)
                      color: root.foreground
                      opacity: 0.6
                      font.family: root.fontFamily
                      font.pixelSize: 10
                    }
                  }
                }

                Text {
                  width: parent.width
                  text: "Today  " + Model.formatTokens(modelData.record.todayTotalTokens || 0)
                    + " tokens  ·  " + (modelData.record.todayPrompts || 0) + " prompts"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: 11
                }

                Text {
                  visible: modelData.models.length > 0
                  text: "Tokens by model"
                  color: root.foreground
                  opacity: 0.75
                  font.family: root.fontFamily
                  font.pixelSize: 11
                }

                Repeater {
                  model: modelData.models

                  RowLayout {
                    required property var modelData
                    width: providersColumn.width
                    spacing: 8

                    Text {
                      Layout.preferredWidth: 165
                      text: modelData.model
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: 10
                      elide: Text.ElideMiddle
                    }
                    Rectangle {
                      Layout.fillWidth: true
                      height: 5
                      radius: 3
                      color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.15)
                      Rectangle {
                        width: parent.width * modelData.fraction
                        height: parent.height
                        radius: 3
                        color: root.foreground
                      }
                    }
                    Text {
                      Layout.preferredWidth: 45
                      text: Model.formatTokens(modelData.tokens)
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: 10
                      horizontalAlignment: Text.AlignRight
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

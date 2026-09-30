pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import "AiUsageModel.js" as Model

// AI quota and token usage per provider. The bar shows the starred provider's
// highest quota, or the highest overall when none is starred. The popup lists
// each provider's quotas, today's totals and tokens by model, starred first.
BarButton {
  id: root

  readonly property var providerRows: Model.recordRows(data.records, data.favorite)
  readonly property bool hasData: providerRows.length > 0
  readonly property var rowsById: {
    var map = {}
    for (var i = 0; i < providerRows.length; i++) map[providerRows[i].id] = providerRows[i]
    return map
  }
  // Provider ids in display order. Only replaced when the order changes, so
  // a data refresh updates the popup in place instead of rebuilding it.
  property var providerIds: []
  readonly property var quotaRows: {
    var starred = rowsById[data.favorite]
    return starred && starred.limits.length > 0 ? [starred] : providerRows
  }
  readonly property real highestQuota: {
    var highest = 0
    for (var i = 0; i < quotaRows.length; i++) {
      var limits = quotaRows[i].limits
      for (var j = 0; j < limits.length; j++) highest = Math.max(highest, limits[j].percent)
    }
    return highest
  }
  // Newest updatedAt across the shown records, in ms (0 when unknown).
  readonly property double updatedAt: {
    var newest = 0
    for (var i = 0; i < providerRows.length; i++) {
      var time = new Date(providerRows[i].record.updatedAt || "").getTime()
      if (isFinite(time)) newest = Math.max(newest, time)
    }
    return newest
  }
  property double now: Date.now()

  visible: hasData
  icon: Icons.robot
  label: highestQuota > 0 ? Model.formatPercent(highestQuota) : ""
  tone: toneFor(highestQuota)
  open: popup.shown
  onClicked: Popups.toggle("ai", popup.screenName)

  AiUsageData {
    id: data
  }

  function syncOrder() {
    var ids = []
    for (var i = 0; i < providerRows.length; i++) ids.push(providerRows[i].id)
    if (ids.join("\n") !== providerIds.join("\n")) providerIds = ids
  }

  onProviderRowsChanged: syncOrder()
  Component.onCompleted: syncOrder()

  IpcHandler {
    target: "leo.ai-usage"
    function open(): void { Popups.openExternal("ai") }
    function close(): void { if (Popups.current === "ai") Popups.close() }
    function toggle(): void { Popups.toggleExternal("ai") }
    function refresh(): void { data.runUpdate(false) }
  }

  // Keeps "Updated N min ago" current while the popup is open.
  Timer {
    interval: 30000
    repeat: true
    running: popup.shown
    onTriggered: root.now = Date.now()
  }

  function toneFor(fraction) {
    return fraction >= 0.9 ? "alert" : fraction >= 0.75 ? "warn" : ""
  }

  function updatedText() {
    if (data.refreshing) return "Refreshing…"
    if (updatedAt <= 0) return ""
    var minutes = Math.floor(Math.max(0, now - updatedAt) / 60000)
    if (minutes < 1) return "Updated just now"
    if (minutes < 60) return "Updated " + minutes + " min ago"
    return "Updated " + Qt.formatDateTime(new Date(updatedAt), "d MMM, HH:mm")
  }

  function tierText(record) {
    var tier = String(record && record.tierLabel || "")
    return tier === "" ? "" : tier.charAt(0).toUpperCase() + tier.slice(1)
  }

  // Only problems are worth a line; a loaded quota already shows as meters.
  function statusText(record) {
    var status = String(record && record.usageStatusText || "")
    if (status === "" || /loaded$/i.test(status)) return ""
    if (status === "Codex unavailable") return "Quota unavailable. Local token history is still shown."
    return "Quota: " + status
  }

  function resetText(value) {
    if (!value) return ""
    var date = new Date(value)
    if (!isFinite(date.getTime())) return ""
    var sameDay = date.toDateString() === new Date(now).toDateString()
    return "Resets " + Qt.formatDateTime(date, sameDay ? "HH:mm" : "d MMM, HH:mm")
  }

  PopupCard {
    id: popup
    popupId: "ai"
    anchorItem: root
    align: "right"
    cardWidth: 420
    maxBodyHeight: 620
    title: "AI usage"
    subtitle: root.updatedText()

    onOpened: {
      root.now = Date.now()
      data.runUpdate(true)
    }

    tools: [
      IconButton {
        icon: Icons.refresh
        busy: data.refreshing
        onClicked: data.runUpdate(false)
      },
      IconButton {
        icon: Icons.close
        onClicked: Popups.close()
      }
    ]

    Repeater {
      model: root.providerIds

      ColumnLayout {
        id: provider

        required property string modelData
        readonly property var row: root.rowsById[modelData] || ({ id: modelData, record: {}, limits: [], models: [] })
        readonly property bool starred: data.favorite === modelData

        Layout.fillWidth: true
        spacing: 6

        Section {
          title: provider.row.record.name || provider.row.id
          tag: root.tierText(provider.row.record)
          named: true

          actions: [
            Glyph {
              text: provider.starred ? Icons.star : Icons.starOutline
              color: provider.starred ? Theme.accent : starPointer.containsMouse ? Theme.foreground : Theme.muted

              MouseArea {
                id: starPointer
                anchors.fill: parent
                anchors.margins: -4
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: data.setFavorite(provider.row.id)
              }
            }
          ]

          Repeater {
            model: provider.row.limits.length

            Meter {
              required property int index
              readonly property var limit: provider.row.limits[index] || ({ label: "", percent: 0, resetsAt: "" })
              label: limit.label
              value: Model.formatPercent(limit.percent)
              fraction: limit.percent
              detail: root.resetText(limit.resetsAt)
              tone: root.toneFor(limit.percent)
            }
          }

          Label {
            Layout.fillWidth: true
            visible: text !== ""
            text: root.statusText(provider.row.record)
            muted: true
            small: true
            wrapMode: Text.Wrap
          }

          KeyValue {
            key: "Today"
            value: Model.formatTokens(provider.row.record.todayTotalTokens || 0) + " tokens · "
              + (provider.row.record.todayPrompts || 0) + " prompts"
          }

          ColumnLayout {
            Layout.fillWidth: true
            visible: provider.row.models.length > 0
            spacing: 6

            Label {
              text: "Tokens by model"
              muted: true
              small: true
            }

            Repeater {
              model: provider.row.models.length

              UsageBar {
                required property int index
                readonly property var entry: provider.row.models[index] || ({ model: "", fraction: 0, tokens: 0 })
                label: entry.model
                fraction: entry.fraction
                value: Model.formatTokens(entry.tokens)
              }
            }
          }
        }
      }
    }

    Label {
      Layout.leftMargin: 10
      Layout.rightMargin: 10
      Layout.fillWidth: true
      visible: !root.hasData
      text: data.refreshing ? "Loading usage…" : "No usage data yet."
      muted: true
      wrapMode: Text.Wrap
    }
  }
}

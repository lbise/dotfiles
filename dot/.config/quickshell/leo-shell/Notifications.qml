pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell

// Notification history from mako. The bell shows how many arrived since the
// popup was last open. Right-click toggles Do not disturb.
// Click a notification to show all of it; the copy button puts its summary
// and body on the clipboard.
BarButton {
  id: root

  readonly property var recent: Mako.entries.slice(0, 20)
  // Keyed by notification id, so a refresh that shifts the list keeps them.
  property int expandedId: -1
  property int copiedId: -1

  function copy(item) {
    Quickshell.execDetached(["wl-copy", "--", item.copyText])
    copiedId = item.id
    copiedReset.restart()
  }

  Timer {
    id: copiedReset
    interval: 1500
    onTriggered: root.copiedId = -1
  }

  icon: Mako.dnd ? Icons.bellOff : Icons.bell
  label: Mako.unread > 0 ? String(Mako.unread) : ""
  tone: Mako.dnd ? "dim" : Mako.unread > 0 ? "accent" : ""
  open: popup.shown

  onClicked: function(button) {
    if (button === Qt.RightButton) Mako.toggleDnd()
    else Popups.toggle("notifications", popup.screenName)
  }

  PopupCard {
    id: popup
    popupId: "notifications"
    anchorItem: root
    align: "right"
    cardWidth: 380
    maxBodyHeight: 560
    title: "Notifications"
    subtitle: Mako.dnd ? "Do not disturb" : ""

    onOpened: {
      root.expandedId = -1
      Mako.markSeen()
    }

    tools: [
      IconButton {
        icon: Icons.close
        onClicked: Popups.close()
      }
    ]

    Section {
      RowLayout {
        Layout.fillWidth: true
        spacing: 12

        ColumnLayout {
          Layout.fillWidth: true
          spacing: 1

          Label { text: "Do not disturb" }

          Label {
            text: "Critical notifications still show"
            muted: true
            small: true
          }
        }

        Toggle {
          checked: Mako.dnd
          onToggled: Mako.toggleDnd()
        }
      }
    }

    Section {
      title: "Recent"
      list: true

      Repeater {
        model: root.recent.length

        Rectangle {
          id: row

          required property int index
          readonly property var item: root.recent[index] || ({ id: -1, app: "", summary: "", body: "", preview: "", copyText: "", critical: false, active: false })
          readonly property bool expanded: item.id === root.expandedId
          readonly property bool truncated: summaryLabel.truncated || bodyLabel.truncated

          Layout.fillWidth: true
          implicitHeight: content.implicitHeight + 16
          radius: Theme.radius + 1
          color: expanded ? Theme.alpha(Theme.foreground, 0.08)
            : hover.hovered && truncated ? Theme.alpha(Theme.foreground, 0.06)
            : "transparent"

          Behavior on color { ColorAnimation { duration: 100 } }

          HoverHandler { id: hover }

          // Under the content, so the copy button takes its own clicks.
          MouseArea {
            anchors.fill: parent
            enabled: row.expanded || row.truncated
            cursorShape: Qt.PointingHandCursor
            onClicked: root.expandedId = row.expanded ? -1 : row.item.id
          }

          ColumnLayout {
            id: content
            x: 8
            y: 8
            width: parent.width - 16
            spacing: 2

            RowLayout {
              Layout.fillWidth: true
              spacing: 8

              Label {
                Layout.fillWidth: true
                text: row.item.app
                muted: true
                small: true
              }

              Chip {
                visible: row.item.critical
                text: "Critical"
                tone: "alert"
              }

              Chip {
                visible: row.item.active
                text: "Showing"
                tone: "accent"
              }

              // Kept in the layout while hidden, so hovering doesn't resize the row.
              IconButton {
                implicitWidth: 22
                implicitHeight: 22
                icon: root.copiedId === row.item.id ? Icons.check : Icons.copy
                opacity: hover.hovered || row.expanded || root.copiedId === row.item.id ? 1 : 0
                enabled: opacity > 0
                onClicked: root.copy(row.item)
              }
            }

            Label {
              id: summaryLabel
              Layout.fillWidth: true
              visible: text !== ""
              text: row.item.summary
              strong: true
              wrapMode: row.expanded ? Text.Wrap : Text.NoWrap
            }

            Label {
              id: bodyLabel
              Layout.fillWidth: true
              visible: text !== ""
              text: row.expanded ? row.item.body : row.item.preview
              muted: true
              wrapMode: Text.Wrap
              maximumLineCount: row.expanded ? undefined : 2
              elide: row.expanded ? Text.ElideNone : Text.ElideRight
            }
          }
        }
      }

      Label {
        visible: root.recent.length === 0
        Layout.margins: 8
        text: Mako.loaded ? "No notifications" : "Loading…"
        muted: true
      }
    }

    footer: [
      PillButton {
        visible: Mako.activeCount > 0
        text: "Dismiss all"
        onClicked: Mako.dismissAll()
      }
    ]
  }
}

pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts

// Notification history from mako. The bell shows how many arrived since the
// popup was last open. Right-click toggles Do not disturb.
BarButton {
  id: root

  readonly property var recent: Mako.entries.slice(0, 20)

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

    onOpened: Mako.markSeen()

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
          readonly property var item: root.recent[index] || ({ app: "", summary: "", body: "", critical: false, active: false })

          Layout.fillWidth: true
          implicitHeight: content.implicitHeight + 16
          radius: Theme.radius + 1
          color: "transparent"

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
            }

            Label {
              Layout.fillWidth: true
              visible: text !== ""
              text: row.item.summary
              strong: true
            }

            Label {
              Layout.fillWidth: true
              visible: text !== ""
              text: row.item.body
              muted: true
              wrapMode: Text.Wrap
              maximumLineCount: 2
              elide: Text.ElideRight
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

pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "CalendarModel.js" as CalendarModel

// Day and time in the bar. Click opens the month calendar, right-click
// resets it to the current month.
BarButton {
  id: root

  property date currentDate: new Date()
  property date displayedMonth: CalendarModel.monthStart(currentDate)

  prefix: Qt.formatDateTime(currentDate, "ddd")
  label: Qt.formatDateTime(currentDate, "HH:mm")
  horizontalPadding: 9
  open: popup.shown

  onClicked: function(mouseButton) {
    if (mouseButton === Qt.RightButton) goToToday()
    else Popups.toggle("calendar", popup.screenName)
  }

  function previousMonth() {
    displayedMonth = CalendarModel.shiftMonth(displayedMonth, -1)
  }

  function nextMonth() {
    displayedMonth = CalendarModel.shiftMonth(displayedMonth, 1)
  }

  function goToToday() {
    displayedMonth = CalendarModel.monthStart(currentDate)
  }

  Timer {
    interval: 1000
    repeat: true
    running: true
    onTriggered: root.currentDate = new Date()
  }

  PopupCard {
    id: popup
    popupId: "calendar"
    anchorItem: root
    align: "center"
    cardWidth: 300

    onOpened: {
      root.goToToday()
      // The card handles Escape; the arrow keys land here first.
      calendar.forceActiveFocus()
    }

    ColumnLayout {
      id: calendar
      Layout.fillWidth: true
      Layout.leftMargin: 6
      Layout.rightMargin: 6
      Layout.topMargin: 4
      spacing: 8

      Keys.onLeftPressed: root.previousMonth()
      Keys.onRightPressed: root.nextMonth()

      RowLayout {
        Layout.fillWidth: true

        IconButton {
          icon: Icons.chevronLeft
          onClicked: root.previousMonth()
        }

        Label {
          Layout.fillWidth: true
          horizontalAlignment: Text.AlignHCenter
          text: Qt.formatDateTime(root.displayedMonth, "MMMM yyyy")
          strong: true
          font.pixelSize: Theme.fontSize + 2
        }

        IconButton {
          icon: Icons.chevronRight
          onClicked: root.nextMonth()
        }
      }

      GridLayout {
        id: grid

        readonly property real cellSize: (width - columnSpacing * 6) / 7

        Layout.fillWidth: true
        columns: 7
        columnSpacing: 3
        rowSpacing: 3

        Repeater {
          model: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

          Label {
            required property string modelData
            Layout.fillWidth: true
            Layout.preferredWidth: grid.cellSize
            Layout.bottomMargin: 2
            horizontalAlignment: Text.AlignHCenter
            text: modelData
            muted: true
            small: true
          }
        }

        Repeater {
          model: 42

          Rectangle {
            id: cell

            required property int index
            readonly property date date: CalendarModel.dateAt(index, root.displayedMonth)
            readonly property bool inMonth: CalendarModel.sameMonth(date, root.displayedMonth)
            readonly property bool today: CalendarModel.sameDay(date, root.currentDate)
            readonly property bool weekend: index % 7 > 4

            Layout.fillWidth: true
            Layout.preferredWidth: grid.cellSize
            Layout.preferredHeight: grid.cellSize
            radius: width / 2
            color: today ? (pointer.containsMouse ? Qt.lighter(Theme.accent, 1.08) : Theme.accent)
              : pointer.containsMouse ? Theme.alpha(Theme.foreground, 0.08)
              : "transparent"

            Behavior on color { ColorAnimation { duration: 120 } }

            Label {
              anchors.centerIn: parent
              text: cell.date.getDate()
              color: cell.today ? Theme.background
                : !cell.inMonth ? Theme.alpha(Theme.muted, 0.55)
                : cell.weekend ? Theme.muted
                : Theme.foreground
              font.weight: cell.today ? Font.Bold : Theme.fontWeight
            }

            MouseArea {
              id: pointer
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              // A day of this month closes the calendar; a neighbouring day shows its month.
              onClicked: {
                if (cell.inMonth) Popups.close()
                else root.displayedMonth = CalendarModel.monthStart(cell.date)
              }
            }
          }
        }
      }
    }

    footerNote: Qt.formatDateTime(root.currentDate, "dddd, d MMMM yyyy")
    footer: [
      PillButton {
        text: "Today"
        onClicked: root.goToToday()
      }
    ]
  }
}

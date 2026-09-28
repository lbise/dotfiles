pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import "CalendarModel.js" as CalendarModel

Item {
  id: root

  property color foreground: "white"
  property color background: "#222831"
  property string fontFamily: "monospace"
  property bool popupOpen: false
  property date currentDate: new Date()
  property date displayedMonth: CalendarModel.monthStart(currentDate)

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  Timer {
    id: clockTimer
    interval: 1000
    repeat: true
    running: true
    onTriggered: root.currentDate = new Date()
  }

  function openCalendar() {
    displayedMonth = CalendarModel.monthStart(root.currentDate)
    popupOpen = true
  }

  function previousMonth() {
    displayedMonth = CalendarModel.shiftMonth(displayedMonth, -1)
  }

  function nextMonth() {
    displayedMonth = CalendarModel.shiftMonth(displayedMonth, 1)
  }

  function goToToday() {
    displayedMonth = CalendarModel.monthStart(root.currentDate)
  }

  Button {
    id: button
    anchors.fill: parent
    label: Qt.formatDateTime(root.currentDate, "ddd  HH:mm")
    foreground: root.foreground
    fontFamily: root.fontFamily
    horizontalPadding: 9
    onClicked: function(mouseButton) {
      if (mouseButton === Qt.RightButton) root.goToToday()
      else root.openCalendar()
    }
  }

  PopupWindow {
    id: popup
    visible: root.popupOpen
    grabFocus: true
    color: "transparent"
    implicitWidth: 330
    implicitHeight: 350

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
        var point = window.contentItem.mapFromItem(
          root, root.width / 2 - popup.width / 2, root.height + 4
        )
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
      Keys.onLeftPressed: root.previousMonth()
      Keys.onRightPressed: root.nextMonth()

      ColumnLayout {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 12

        RowLayout {
          Layout.fillWidth: true

          Button {
            label: "‹"
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: root.previousMonth()
          }

          Text {
            Layout.fillWidth: true
            text: Qt.formatDateTime(root.displayedMonth, "MMMM yyyy")
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: 15
            font.bold: true
            horizontalAlignment: Text.AlignHCenter
          }

          Button {
            label: "›"
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: root.nextMonth()
          }
        }

        RowLayout {
          Layout.fillWidth: true
          spacing: 0

          Repeater {
            model: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

            Text {
              required property string modelData
              Layout.fillWidth: true
              text: modelData
              color: root.foreground
              opacity: 0.65
              font.family: root.fontFamily
              font.pixelSize: 11
              horizontalAlignment: Text.AlignHCenter
            }
          }
        }

        GridLayout {
          id: daysGrid
          Layout.fillWidth: true
          Layout.fillHeight: true
          columns: 7
          rows: 6
          columnSpacing: 2
          rowSpacing: 2

          Repeater {
            model: 42

            Rectangle {
              id: dayCell
              required property int index
              readonly property int day: CalendarModel.dayAt(index, root.displayedMonth)
              readonly property bool today: day > 0 && CalendarModel.sameDay(
                new Date(root.displayedMonth.getFullYear(), root.displayedMonth.getMonth(), day),
                root.currentDate
              )

              Layout.fillWidth: true
              Layout.fillHeight: true
              radius: 4
              color: today
                ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.25)
                : mouse.containsMouse
                  ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
                  : "transparent"

              Text {
                anchors.centerIn: parent
                text: dayCell.day > 0 ? String(dayCell.day) : ""
                color: root.foreground
                opacity: dayCell.day > 0 ? 1 : 0
                font.family: root.fontFamily
                font.pixelSize: 12
                font.bold: dayCell.today
              }

              MouseArea {
                id: mouse
                anchors.fill: parent
                enabled: dayCell.day > 0
                hoverEnabled: true
                onClicked: root.popupOpen = false
              }
            }
          }
        }

        RowLayout {
          Layout.fillWidth: true

          Text {
            Layout.fillWidth: true
            text: Qt.formatDateTime(root.currentDate, "dddd, d MMMM yyyy")
            color: root.foreground
            opacity: 0.7
            font.family: root.fontFamily
            font.pixelSize: 11
          }

          Button {
            label: "Today"
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: root.goToToday()
          }
        }
      }
    }
  }
}

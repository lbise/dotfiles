import QtQuick
import QtQuick.Effects
import QtQuick.Layouts
import Quickshell

// A popup that floats under its bar button, on the raised surface.
//
//   PopupCard {
//     popupId: "audio"
//     anchorItem: button
//     title: "Sound"
//     tools: [ IconButton { ... } ]      // header, right side
//     Section { ... }                     // body, stacked with 12px gaps
//     footer: [ PillButton { ... } ]      // bottom row, right aligned
//   }
//
// Open and close it through Popups. When it was opened by a click, Escape
// and a click elsewhere close it (see Popups.grab).
PopupWindow {
  id: root

  required property string popupId
  required property Item anchorItem
  // "left", "center" or "right": which edge of the button the card lines up with.
  property string align: "right"
  property int cardWidth: 340
  property int maxBodyHeight: 620
  property string title: ""
  property string subtitle: ""
  property alias tools: toolsRow.data
  property alias footer: footerRow.data
  // Muted text on the left of the footer, e.g. the full date.
  property string footerNote: ""
  default property alias content: body.data

  readonly property string screenName: anchorItem && anchorItem.QsWindow.window && anchorItem.QsWindow.window.screen
    ? anchorItem.QsWindow.window.screen.name : ""
  readonly property bool shown: Popups.isOpen(popupId, screenName)

  // Room around the card for its shadow; the card itself starts `gapBelowBar`
  // under the bar.
  readonly property int shadowPad: 24
  readonly property int gapBelowBar: 8

  signal opened()

  color: "transparent"
  visible: false
  implicitWidth: cardWidth + shadowPad * 2
  implicitHeight: card.height + gapBelowBar + shadowPad

  onShownChanged: {
    if (shown) {
      grabFocus = Popups.grab
      visible = true
      reveal.restart()
      card.forceActiveFocus()
      opened()
    } else {
      visible = false
    }
  }

  // With a grab, the compositor hides the popup when you click elsewhere.
  onVisibleChanged: if (!visible && shown) Popups.close()

  anchor {
    id: popupAnchor
    window: root.anchorItem ? root.anchorItem.QsWindow.window : null
    adjustment: PopupAdjustment.Slide
    edges: Edges.Bottom | Edges.Left
    gravity: Edges.Bottom | Edges.Right
    rect.width: 1
    rect.height: 1

    onAnchoring: {
      var window = root.anchorItem.QsWindow.window
      if (!window) return
      var left = window.contentItem.mapFromItem(root.anchorItem, 0, 0).x
      var x = root.align === "left" ? left
        : root.align === "center" ? left + root.anchorItem.width / 2 - root.cardWidth / 2
        : left + root.anchorItem.width - root.cardWidth
      popupAnchor.rect.x = Math.round(x - root.shadowPad)
      popupAnchor.rect.y = window.height - 1
    }
  }

  Rectangle {
    id: card

    x: root.shadowPad
    y: root.gapBelowBar
    width: root.cardWidth
    height: column.implicitHeight + 12
    radius: Theme.radius + 6
    color: Theme.surface
    border.width: 1
    border.color: Theme.alpha(Theme.foreground, 0.07)
    focus: true
    Keys.onEscapePressed: Popups.close()

    layer.enabled: true
    layer.effect: MultiEffect {
      shadowEnabled: true
      shadowColor: "#000000"
      shadowOpacity: 0.5
      shadowBlur: 0.9
      shadowVerticalOffset: 10
      blurMax: 32
    }

    transform: Translate { id: slide }

    ParallelAnimation {
      id: reveal
      NumberAnimation { target: card; property: "opacity"; from: 0; to: 1; duration: 140; easing.type: Easing.OutCubic }
      NumberAnimation { target: slide; property: "y"; from: -6; to: 0; duration: 180; easing.type: Easing.OutCubic }
    }

    ColumnLayout {
      id: column
      x: 6
      y: 6
      width: parent.width - 12
      spacing: 0

      RowLayout {
        Layout.fillWidth: true
        Layout.leftMargin: 8
        Layout.rightMargin: 2
        Layout.topMargin: 4
        Layout.bottomMargin: 10
        visible: root.title !== "" || toolsRow.children.length > 0
        spacing: 10

        ColumnLayout {
          Layout.fillWidth: true
          spacing: 1

          Label {
            Layout.fillWidth: true
            text: root.title
            font.pixelSize: Theme.fontTitle
            font.weight: Font.DemiBold
          }

          Label {
            Layout.fillWidth: true
            visible: root.subtitle !== ""
            text: root.subtitle
            muted: true
            small: true
          }
        }

        Row {
          id: toolsRow
          Layout.alignment: Qt.AlignVCenter
          spacing: 6
        }
      }

      Flickable {
        id: scroller
        Layout.fillWidth: true
        Layout.preferredHeight: Math.min(body.implicitHeight, root.maxBodyHeight)
        contentHeight: body.implicitHeight
        interactive: body.implicitHeight > root.maxBodyHeight
        clip: interactive
        boundsBehavior: Flickable.StopAtBounds

        ColumnLayout {
          id: body
          width: scroller.width
          spacing: 12
        }

        // Parented to the Flickable itself: as a child of its content it
        // would scroll away with the list.
        Rectangle {
          parent: scroller
          z: 1
          visible: scroller.interactive
          x: scroller.width - 4
          y: scroller.visibleArea.yPosition * scroller.height
          width: 3
          height: scroller.visibleArea.heightRatio * scroller.height
          radius: 1.5
          color: Theme.alpha(Theme.foreground, 0.2)
        }
      }

      RowLayout {
        Layout.fillWidth: true
        Layout.topMargin: 10
        Layout.leftMargin: 10
        Layout.rightMargin: 4
        Layout.bottomMargin: 4
        visible: footerRow.children.length > 0 || root.footerNote !== ""
        spacing: 8

        Label {
          Layout.fillWidth: true
          text: root.footerNote
          muted: true
          small: true
        }

        Row {
          id: footerRow
          spacing: 6
        }
      }
    }
  }
}

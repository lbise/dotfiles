pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell.Services.Mpris
import Quickshell.Widgets

// Now playing, from any MPRIS player (browser, Spotify, mpv...). It only shows
// while a player has a track. Right-click plays or pauses, middle-click skips
// to the next track. The popup has the cover, a seek bar and the controls, and
// picks the player when several are open.
BarButton {
  id: root

  // Player chosen in the popup (its D-Bus name); "" follows whichever plays.
  property string pinned: ""

  readonly property var players: Mpris.players.values
  readonly property var player: {
    var list = players
    for (var i = 0; i < list.length; i++) if (pinned !== "" && list[i].dbusName === pinned) return list[i]
    for (var j = 0; j < list.length; j++) if (list[j].isPlaying) return list[j]
    for (var k = 0; k < list.length; k++) if (list[k].trackTitle !== "") return list[k]
    return null
  }
  readonly property bool playing: player !== null && player.isPlaying
  readonly property string title: player ? player.trackTitle : ""
  readonly property string artist: player ? player.trackArtist : ""

  visible: player !== null && title !== ""
  icon: playing ? Icons.music : Icons.pause
  tone: playing ? "" : "dim"
  label: shorten(title, 28)
  open: popup.shown

  onClicked: function(button) {
    if (button === Qt.RightButton) { if (player && player.canTogglePlaying) player.togglePlaying() }
    else if (button === Qt.MiddleButton) { if (player && player.canGoNext) player.next() }
    else Popups.toggle("media", popup.screenName)
  }

  function shorten(text, length) {
    return text.length > length ? text.substring(0, length - 1).replace(/\s+$/, "") + "…" : text
  }

  function clock(seconds) {
    var total = Math.max(0, Math.floor(seconds))
    var minutes = Math.floor(total / 60)
    var rest = total % 60
    return minutes + ":" + (rest < 10 ? "0" : "") + rest
  }

  PopupCard {
    id: popup
    popupId: "media"
    anchorItem: root
    align: "right"
    cardWidth: 360
    title: "Now playing"
    subtitle: root.player ? root.player.identity : ""

    tools: [
      IconButton {
        icon: Icons.close
        onClicked: Popups.close()
      }
    ]

    // The player does not announce its position; ask for it while it plays.
    Timer {
      interval: 1000
      repeat: true
      running: popup.shown && root.playing
      onTriggered: root.player.positionChanged()
    }

    onOpened: if (root.player) root.player.positionChanged()

    Section {
      RowLayout {
        Layout.fillWidth: true
        spacing: 14

        ClippingRectangle {
          Layout.preferredWidth: 76
          Layout.preferredHeight: 76
          radius: Theme.radius
          color: Theme.alpha(Theme.foreground, 0.08)

          Image {
            id: art
            anchors.fill: parent
            source: root.player ? root.player.trackArtUrl : ""
            fillMode: Image.PreserveAspectCrop
            visible: status === Image.Ready
            asynchronous: true
          }

          Glyph {
            anchors.centerIn: parent
            visible: art.status !== Image.Ready
            text: Icons.music
            size: 28
            color: Theme.muted
          }
        }

        ColumnLayout {
          Layout.fillWidth: true
          spacing: 2

          Label {
            Layout.fillWidth: true
            text: root.title
            strong: true
            font.pixelSize: Theme.fontTitle
            wrapMode: Text.Wrap
            maximumLineCount: 2
            elide: Text.ElideRight
          }

          Label {
            Layout.fillWidth: true
            visible: text !== ""
            text: root.artist
          }

          Label {
            Layout.fillWidth: true
            visible: text !== ""
            text: root.player ? root.player.trackAlbum : ""
            muted: true
            small: true
          }
        }
      }

      ColumnLayout {
        Layout.fillWidth: true
        visible: root.player !== null && root.player.lengthSupported && root.player.length > 0
        spacing: 5

        Rectangle {
          id: seekTrack
          Layout.fillWidth: true
          implicitHeight: 6
          radius: 3
          color: Theme.alpha(Theme.foreground, 0.12)

          readonly property real fraction: root.player && root.player.length > 0
            ? Math.max(0, Math.min(1, root.player.position / root.player.length)) : 0

          Rectangle {
            width: parent.width * seekTrack.fraction
            height: parent.height
            radius: parent.radius
            color: Theme.accent
          }

          // A taller hit area than the bar itself.
          MouseArea {
            anchors.fill: parent
            anchors.topMargin: -8
            anchors.bottomMargin: -8
            enabled: root.player !== null && root.player.canSeek
            cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
            onClicked: function(mouse) {
              root.player.position = Math.max(0, Math.min(1, mouse.x / width)) * root.player.length
              root.player.positionChanged()
            }
          }
        }

        RowLayout {
          Layout.fillWidth: true

          Label {
            text: root.player ? root.clock(root.player.position) : ""
            muted: true
            small: true
          }

          Item { Layout.fillWidth: true }

          Label {
            text: root.player ? root.clock(root.player.length) : ""
            muted: true
            small: true
          }
        }
      }

      RowLayout {
        Layout.alignment: Qt.AlignHCenter
        spacing: 10

        IconButton {
          icon: Icons.skipPrevious
          enabled: root.player !== null && root.player.canGoPrevious
          opacity: enabled ? 1 : 0.4
          onClicked: if (enabled) root.player.previous()
        }

        IconButton {
          implicitWidth: 40
          implicitHeight: 40
          icon: root.playing ? Icons.pause : Icons.play
          enabled: root.player !== null && root.player.canTogglePlaying
          opacity: enabled ? 1 : 0.4
          onClicked: if (enabled) root.player.togglePlaying()
        }

        IconButton {
          icon: Icons.skipNext
          enabled: root.player !== null && root.player.canGoNext
          opacity: enabled ? 1 : 0.4
          onClicked: if (enabled) root.player.next()
        }
      }
    }

    Section {
      title: "Players"
      list: true
      visible: root.players.length > 1

      Repeater {
        model: root.players

        ListRow {
          required property var modelData
          readonly property bool current: root.player !== null && modelData.dbusName === root.player.dbusName

          icon: modelData.isPlaying ? Icons.music : Icons.pause
          title: modelData.identity
          subtitle: modelData.trackTitle
          active: current
          trailingIcon: current ? Icons.check : ""
          onClicked: root.pinned = modelData.dbusName
        }
      }
    }
  }
}

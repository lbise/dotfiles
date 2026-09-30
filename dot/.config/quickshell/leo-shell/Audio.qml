import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Services.Pipewire

// Volume in the bar. Right-click mutes, scrolling changes the volume.
// The popup sets output and input volume and picks the output device.
BarButton {
  id: root

  readonly property var sink: Pipewire.defaultAudioSink
  readonly property var source: Pipewire.defaultAudioSource
  readonly property var sinkAudio: sink ? sink.audio : null
  readonly property var sourceAudio: source ? source.audio : null
  readonly property real volume: sinkAudio ? sinkAudio.volume : 0
  readonly property bool muted: sinkAudio ? sinkAudio.muted : false

  readonly property var outputs: {
    var nodes = Pipewire.nodes.values
    var result = []
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i]
      if (node.isSink && !node.isStream && node.audio) result.push(node)
    }
    return result
  }

  icon: muted ? Icons.volumeOff
    : volume >= 0.5 ? Icons.volumeHigh
    : volume > 0 ? Icons.volumeMedium
    : Icons.volumeLow
  tone: muted ? "dim" : ""
  open: popup.shown

  onClicked: function(button) {
    if (button === Qt.RightButton) toggleMute()
    else Popups.toggle("audio", popup.screenName)
  }
  onWheel: function(delta) { setVolume(volume + (delta > 0 ? 0.05 : -0.05)) }

  function setVolume(value) {
    if (!sinkAudio) return
    sinkAudio.muted = false
    sinkAudio.volume = Math.max(0, Math.min(1, value))
  }

  function toggleMute() {
    if (sinkAudio) sinkAudio.muted = !sinkAudio.muted
  }

  function nodeName(node) {
    if (!node) return "No device"
    return node.description || node.nickname || node.name || "Audio device"
  }

  function nodeKind(node) {
    var text = (String(node.name) + " " + String(node.description)).toLowerCase()
    if (text.indexOf("bluez") !== -1) return "Bluetooth"
    if (text.indexOf("hdmi") !== -1 || text.indexOf("displayport") !== -1) return "Display"
    if (text.indexOf("usb") !== -1) return "USB"
    return "Built-in"
  }

  function nodeIcon(node) {
    var kind = nodeKind(node)
    if (kind === "Bluetooth") return Icons.headphones
    if (kind === "Display") return Icons.monitor
    return Icons.speaker
  }

  // Volume and mute are only live for tracked nodes.
  PwObjectTracker {
    objects: [root.sink, root.source].concat(root.outputs)
  }

  PopupCard {
    id: popup
    popupId: "audio"
    anchorItem: root
    cardWidth: 340
    title: "Sound"
    subtitle: root.muted ? "Muted" : root.nodeName(root.sink)

    PillSlider {
      Layout.leftMargin: 4
      Layout.rightMargin: 4
      label: "Output"
      icon: root.muted ? Icons.volumeOff : Icons.volumeHigh
      value: root.volume
      muted: root.muted
      onMoved: function(value) { root.setVolume(value) }
      onIconClicked: root.toggleMute()
    }

    Section {
      title: "Output device"
      list: true

      Repeater {
        model: root.outputs

        ListRow {
          required property var modelData
          readonly property bool current: root.sink !== null && modelData.id === root.sink.id

          icon: root.nodeIcon(modelData)
          title: root.nodeName(modelData)
          subtitle: root.nodeKind(modelData)
          active: current
          trailingIcon: current ? Icons.check : ""
          onClicked: Pipewire.preferredDefaultAudioSink = modelData
        }
      }

      Label {
        visible: root.outputs.length === 0
        Layout.margins: 8
        text: "No output devices"
        muted: true
      }
    }

    PillSlider {
      Layout.leftMargin: 4
      Layout.rightMargin: 4
      visible: root.sourceAudio !== null
      label: "Input · " + root.nodeName(root.source)
      icon: root.sourceAudio && root.sourceAudio.muted ? Icons.microphoneOff : Icons.microphone
      value: root.sourceAudio ? root.sourceAudio.volume : 0
      muted: root.sourceAudio ? root.sourceAudio.muted : false
      onMoved: function(value) {
        root.sourceAudio.muted = false
        root.sourceAudio.volume = value
      }
      onIconClicked: root.sourceAudio.muted = !root.sourceAudio.muted
    }

    footer: [
      PillButton {
        text: root.muted ? "Unmute" : "Mute"
        onClicked: root.toggleMute()
      },
      PillButton {
        text: "Mixer"
        icon: Icons.tune
        onClicked: {
          Popups.close()
          Quickshell.execDetached(["pavucontrol"])
        }
      }
    ]
  }
}

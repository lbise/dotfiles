import QtQuick
import QtQuick.Layouts

// Single-line text input with a label above it.
ColumnLayout {
  id: root

  property string label: ""
  property string placeholder: ""
  property bool password: false
  property alias text: input.text
  property alias input: input

  signal accepted()

  Layout.fillWidth: true
  spacing: 5

  function focusInput() { input.forceActiveFocus() }

  Label {
    visible: root.label !== ""
    text: root.label
    muted: true
    small: true
  }

  Rectangle {
    Layout.fillWidth: true
    implicitHeight: 34
    radius: Math.round(Theme.radius * 0.8)
    color: Theme.background
    border.width: 1
    border.color: input.activeFocus ? Theme.accent : Theme.rule

    TextInput {
      id: input
      anchors.fill: parent
      anchors.leftMargin: 10
      anchors.rightMargin: 10
      verticalAlignment: TextInput.AlignVCenter
      color: Theme.foreground
      selectionColor: Theme.alpha(Theme.accent, 0.35)
      selectedTextColor: Theme.foreground
      font.family: Theme.fontFamily
      font.pixelSize: Theme.fontSize
      echoMode: root.password ? TextInput.Password : TextInput.Normal
      passwordCharacter: "•"
      clip: true
      onAccepted: root.accepted()
      Keys.onEscapePressed: function(event) { event.accepted = false }

      Label {
        anchors.fill: parent
        visible: input.text === "" && !input.activeFocus
        text: root.placeholder
        muted: true
      }
    }
  }
}

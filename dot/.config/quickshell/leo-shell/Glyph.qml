import QtQuick

// A single Nerd Font icon.
Text {
  property int size: Theme.glyphSize

  color: Theme.foreground
  font.family: Theme.glyphFamily
  font.pixelSize: size
  horizontalAlignment: Text.AlignHCenter
  verticalAlignment: Text.AlignVCenter
  renderType: Text.NativeRendering
}

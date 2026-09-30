import QtQuick

// Text in the shell's type. `muted` and `small` cover secondary text;
// `strong` is for titles and names.
Text {
  property bool muted: false
  property bool small: false
  property bool strong: false

  color: muted ? Theme.muted : Theme.foreground
  font.family: Theme.fontFamily
  font.pixelSize: small ? Theme.fontSmall : Theme.fontSize
  font.weight: strong ? Font.DemiBold : Theme.fontWeight
  font.features: ({ "tnum": 1 })
  elide: Text.ElideRight
  verticalAlignment: Text.AlignVCenter
  renderType: Text.NativeRendering
}

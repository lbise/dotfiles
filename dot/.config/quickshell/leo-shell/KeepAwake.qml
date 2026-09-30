import QtQuick

// Bar reminder that Keep awake is on. It only shows while active; click to
// turn it off. Turn it on from the Arch menu.
BarButton {
  icon: Icons.coffee
  tone: "accent"
  visible: Caffeine.active
  onClicked: Caffeine.toggle()
}

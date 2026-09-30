import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io

// Arch logo in the bar. The popup opens the launcher and clipboard, and holds
// the session actions. Restart, Shut down and Log out ask for a second click.
BarButton {
  id: root

  icon: Icons.arch
  tone: "accent"
  horizontalPadding: 9
  open: popup.shown
  onClicked: Popups.toggle("menu", popup.screenName)

  function run(command) {
    Popups.close()
    Quickshell.execDetached(command)
  }

  FileView {
    id: hostnameFile
    path: "/etc/hostname"
  }

  PopupCard {
    id: popup
    popupId: "menu"
    anchorItem: root
    align: "left"
    cardWidth: 340
    title: (Quickshell.env("USER") || "leo") + "@" + (hostnameFile.text().trim() || "localhost")
    subtitle: "Arch Linux · Hyprland"

    Section {
      list: true

      ListRow {
        icon: Icons.apps
        title: "Applications"
        trailing: "Super Space"
        onClicked: root.run(["walker"])
      }

      ListRow {
        icon: Icons.clipboard
        title: "Clipboard"
        trailing: "Super Ctrl V"
        onClicked: root.run(["walker", "-m", "clipboard"])
      }

      ListRow {
        icon: Icons.coffee
        title: "Keep awake"
        subtitle: "Stop the screen from locking"
        active: Caffeine.active
        trailing: Caffeine.active ? "On" : "Off"
        onClicked: Caffeine.toggle()
      }
    }

    RowLayout {
      Layout.fillWidth: true
      spacing: 4

      TileButton {
        icon: Icons.lock
        label: "Lock"
        onActivated: root.run(["system-lock-screen.sh"])
      }

      TileButton {
        icon: Icons.sleep
        label: "Suspend"
        onActivated: root.run(["systemctl", "suspend"])
      }

      TileButton {
        icon: Icons.logout
        label: "Log out"
        confirm: true
        onActivated: root.run(["uwsm", "stop"])
      }

      TileButton {
        icon: Icons.restart
        label: "Restart"
        confirm: true
        onActivated: root.run(["system-reboot.sh"])
      }

      TileButton {
        icon: Icons.power
        label: "Shut down"
        danger: true
        confirm: true
        onActivated: root.run(["system-shutdown.sh"])
      }
    }
  }
}

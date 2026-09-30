pragma ComponentBehavior: Bound

import QtQuick
import QtQml
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import Quickshell.Services.SystemTray
import Quickshell.Widgets

// A chevron that opens the list of background apps (tray items).
// Left-click activates an app, right-click shows its menu inside the card,
// middle-click runs its secondary action. Shift+scroll sends the wheel to the app.
//
// The app menu is drawn here from the item's menu entries rather than with
// item.display(): that opens a separate native menu window, which the
// popup's Hyprland focus grab does not include, so it never appeared.
BarButton {
  id: root

  // Tray items the bar already covers, or that are not worth a row.
  // Match against the item id (see `busctl --user get-property
  // org.kde.StatusNotifierWatcher /StatusNotifierWatcher
  // org.kde.StatusNotifierWatcher RegisteredStatusNotifierItems`).
  readonly property var hiddenIds: [
    "nm-applet",  // Network: the Wi-Fi popup does this
    "Fcitx"       // Input method
  ]

  readonly property var trayItems: {
    var result = []
    var seen = ({})
    var values = SystemTray.items.values
    for (var i = 0; i < values.length; i++) {
      var item = values[i]
      if (item.status === Status.Passive) continue
      if (hiddenIds.indexOf(String(item.id)) !== -1) continue
      var key = String(item.id || item.title || i)
      if (seen[key]) continue
      seen[key] = true
      result.push(item)
    }
    return result
  }
  readonly property bool needsAttention: trayItems.some(function(item) {
    return item.status === Status.NeedsAttention
  })

  // The app whose menu is shown, and the submenus opened inside it.
  property var menuItem: null
  property var menuStack: []
  property var menuTitles: []
  readonly property var currentMenu: menuStack.length ? menuStack[menuStack.length - 1]
    : menuItem ? menuItem.menu : null

  function showMenu(item) {
    console.log("[debug] showMenu " + (item ? item.id : "null") + " hasMenu=" + (item ? item.hasMenu : "")) // TEMP
    if (!item || !item.hasMenu) return
    menuStack = []
    menuTitles = []
    menuItem = item
  }

  function openSubmenu(entry) {
    menuStack = menuStack.concat([entry])
    menuTitles = menuTitles.concat([cleanText(entry.text)])
  }

  function back() {
    if (menuStack.length) {
      menuStack = menuStack.slice(0, -1)
      menuTitles = menuTitles.slice(0, -1)
    } else {
      menuItem = null
    }
  }

  // Menu labels use "_" or "&" to mark keyboard mnemonics.
  function cleanText(text) {
    return String(text || "").replace(/_([^_])/g, "$1").replace(/&([^&])/g, "$1")
  }

  // The menu entries are only valid while their app is still in the tray.
  onTrayItemsChanged: if (menuItem && trayItems.indexOf(menuItem) === -1) menuItem = null

  visible: trayItems.length > 0
  icon: popup.shown ? Icons.chevronUp : Icons.chevronDown
  tone: popup.shown ? "accent" : ""
  open: popup.shown
  attention: needsAttention && !popup.shown
  horizontalPadding: 7
  onClicked: Popups.toggle("apps", popup.screenName)

  IpcHandler {
    target: "leo.tray"
    function open(): void { Popups.openExternal("apps") }
    function close(): void { Popups.close() }
    function toggle(): void { Popups.toggleExternal("apps") }
    function debugMenu(index: int): void { root.showMenu(root.trayItems[index]) } // TEMP
    function debugState(): string { return "current=" + Popups.current + " menu=" + (root.menuItem ? root.menuItem.id : "none") } // TEMP
  }

  function iconSource(icon) {
    var source = String(icon || "")
    if (source === "") return ""
    if (source.indexOf("image://icon/") === 0) source = source.slice(13)
    if (source.indexOf("://") !== -1 || source[0] === "/") return source
    if (source === "input-keyboard-symbolic")
      return "file:///usr/share/icons/breeze-dark/devices/16/input-keyboard-symbolic.svg"

    // Dropbox's tray PNG lives below the search root it publishes.
    var dropbox = source.match(/^(dropboxstatus-[^?]+)\?path=(.*)$/)
    if (dropbox) return "file://" + dropbox[2] + "/hicolor/16x16/status/" + dropbox[1] + ".png"

    if (source.indexOf("?path=") !== -1) return "image://icon/" + source
    return "image://icon/" + source + "?path=/usr/share/icons/Adwaita"
  }

  // Turns "teams-for-linux_status_icon_1" into "Teams for linux" and
  // "dropbox" into "Dropbox". Chromium web apps all report the same id.
  function appTitle(item) {
    var title = String(item.title || "").trim()
    var id = String(item.id || "").trim()
    if (/^(chrome|chromium)_status_icon(_\d+)?$/i.test(title || id)) return "Browser app"
    var name = title || id.replace(/_status_icon(_\d+)?$/i, "").replace(/-client(-\d+)?$/i, "")
    name = name.replace(/[-_]+/g, " ").trim()
    if (name === "") return "App"
    return name.charAt(0).toUpperCase() + name.slice(1)
  }

  PopupCard {
    id: popup
    popupId: "apps"
    anchorItem: root
    cardWidth: 300
    maxBodyHeight: 420
    title: root.menuItem ? root.appTitle(root.menuItem) : "Background apps"
    subtitle: root.menuItem
      ? (root.menuTitles.length ? root.menuTitles.join(" › ") : "App menu")
      : root.trayItems.length === 1 ? "1 running" : root.trayItems.length + " running"

    tools: [
      IconButton {
        visible: root.menuItem !== null
        icon: Icons.chevronLeft
        onClicked: root.back()
      }
    ]

    onShownChanged: if (!shown) root.menuItem = null

    Section {
      list: true
      visible: root.menuItem === null

      Repeater {
        model: root.trayItems

        ListRow {
          id: row
          required property var modelData
          imageSource: root.iconSource(modelData.icon)
          letter: root.appTitle(modelData).charAt(0)
          title: root.appTitle(modelData)
          attention: modelData.status === Status.NeedsAttention
          trailing: attention ? "Needs attention" : ""

          onClicked: function(button, x, y) {
            console.log("[debug] row clicked button=" + button) // TEMP
            if (button === Qt.RightButton) {
              root.showMenu(modelData)
            } else if (button === Qt.MiddleButton) {
              modelData.secondaryActivate()
            } else if (modelData.onlyMenu) {
              root.showMenu(modelData)
            } else {
              modelData.activate()
              Popups.close()
            }
          }
          onWheel: function(delta, modifiers) {
            if (modifiers & Qt.ShiftModifier) modelData.scroll(delta, false)
          }
        }
      }
    }

    Section {
      list: true
      visible: root.menuItem !== null

      QsMenuOpener {
        id: opener
        menu: root.currentMenu
      }

      // Keep the app menu and every open submenu referenced. Without this,
      // moving into a submenu drops the last reference to its parent and
      // Quickshell unloads the tree, so the submenu shows up empty.
      Instantiator {
        model: root.menuItem ? [root.menuItem.menu].concat(root.menuStack) : []
        delegate: QsMenuOpener {
          required property var modelData
          menu: modelData
        }
      }

      Repeater {
        model: opener.children

        MenuEntryRow {
          required property var modelData
          entry: modelData
        }
      }

      Label {
        visible: opener.children.values.length === 0
        Layout.margins: 8
        text: "This app has no menu"
        muted: true
      }
    }

    Label {
      Layout.fillWidth: true
      Layout.leftMargin: 10
      Layout.rightMargin: 10
      visible: root.menuItem === null
      text: "Right-click an app for its menu"
      muted: true
      small: true
      wrapMode: Text.WordWrap
    }
  }

  // One entry of an app menu: a separator, an action, a checkbox or radio
  // item, or a submenu.
  component MenuEntryRow: Item {
    id: entryRow

    property var entry: null
    readonly property bool checkable: entry && entry.buttonType !== QsMenuButtonType.None
    readonly property bool checked: entry && entry.checkState === Qt.Checked

    Layout.fillWidth: true
    implicitHeight: entry && entry.isSeparator ? 9 : 32

    Rectangle {
      visible: entryRow.entry && entryRow.entry.isSeparator
      anchors.verticalCenter: parent.verticalCenter
      x: 8
      width: parent.width - 16
      height: 1
      color: Theme.rule
    }

    Rectangle {
      visible: entryRow.entry && !entryRow.entry.isSeparator
      anchors.fill: parent
      radius: Theme.radius
      color: pointer.containsMouse && entryRow.entry.enabled ? Theme.alpha(Theme.foreground, 0.06) : "transparent"

      RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 8
        anchors.rightMargin: 8
        spacing: 10

        Item {
          Layout.preferredWidth: 18
          Layout.preferredHeight: 18

          Glyph {
            anchors.centerIn: parent
            visible: entryRow.checkable
            text: entryRow.checked ? Icons.check : ""
            size: 14
            color: Theme.accent
          }

          IconImage {
            anchors.centerIn: parent
            visible: !entryRow.checkable && source !== ""
            source: entryRow.entry && entryRow.entry.icon ? entryRow.entry.icon : ""
            implicitSize: 16
          }
        }

        Label {
          Layout.fillWidth: true
          text: entryRow.entry ? root.cleanText(entryRow.entry.text) : ""
          muted: entryRow.entry && !entryRow.entry.enabled
        }

        Glyph {
          visible: entryRow.entry && entryRow.entry.hasChildren
          text: Icons.chevronRight
          size: 14
          color: Theme.muted
        }
      }

      MouseArea {
        id: pointer
        anchors.fill: parent
        hoverEnabled: true
        enabled: entryRow.entry && entryRow.entry.enabled
        cursorShape: Qt.PointingHandCursor
        onClicked: {
          if (entryRow.entry.hasChildren) {
            root.openSubmenu(entryRow.entry)
          } else {
            entryRow.entry.triggered()
            Popups.close()
          }
        }
      }
    }
  }
}

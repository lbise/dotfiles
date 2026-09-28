//@ pragma UseQApplication

import QtQuick
import Quickshell

ShellRoot {
  id: root

  Theme {
    id: theme
  }

  Variants {
    model: Quickshell.screens

    delegate: Component {
      Bar {
        required property var modelData

        output: modelData
        shellTheme: theme
      }
    }
  }
}

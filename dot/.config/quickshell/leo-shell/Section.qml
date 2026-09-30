import QtQuick
import QtQuick.Layouts

// A titled group inside a popup. The body sits on the inset colour.
//
// A plain title ("Paired", "Output device") is small and muted. When the
// section is about one thing, give it a `tag` or `status` and the title
// becomes the thing's name ("Claude Code", "Office Laser").
// Set `list: true` when the body is a list of rows, for tighter padding.
ColumnLayout {
  id: root

  property string title: ""
  property string tag: ""
  property string status: ""
  // "ok", "warn", "alert" or "" for neutral
  property string statusTone: ""
  property bool list: false
  default property alias content: bodyColumn.data
  // Small controls at the right end of the title row, e.g. a star.
  property alias actions: actionRow.data

  // Strong title naming the subject; on by default when there is a tag or status.
  property bool named: tag !== "" || status !== ""

  Layout.fillWidth: true
  spacing: 6

  RowLayout {
    Layout.fillWidth: true
    Layout.leftMargin: 10
    Layout.rightMargin: 6
    visible: root.title !== ""
    spacing: 8

    Label {
      text: root.title
      muted: !root.named
      small: !root.named
      strong: root.named
      font.weight: root.named ? Font.DemiBold : Font.Medium
    }

    Chip {
      visible: root.tag !== ""
      text: root.tag
    }

    Item { Layout.fillWidth: true }

    Chip {
      visible: root.status !== ""
      text: root.status
      tone: root.statusTone
    }

    Row {
      id: actionRow
      spacing: 4
    }
  }

  Rectangle {
    Layout.fillWidth: true
    implicitHeight: bodyColumn.implicitHeight + bodyColumn.anchors.margins * 2
    radius: Theme.radius + 3
    color: Theme.inset

    ColumnLayout {
      id: bodyColumn
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.top: parent.top
      anchors.margins: root.list ? 4 : 12
      spacing: root.list ? 0 : 12
    }
  }
}

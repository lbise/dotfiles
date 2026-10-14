pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import "GarminModel.js" as Model

// The Garmin watch's music, shown while the watch is plugged in over USB.
// The popup shows storage and lists Music/ by artist. Add music picks files
// with zenity, then lists them with their artist, title and album to check
// before uploading; the watch's player shows these tags, not folder names.
// Tracks and whole artists can be retagged or deleted (deleting takes a
// second click). While a job runs the bar shows its progress.
BarButton {
  id: root

  // Expanded artist (its path, or "" for loose files) and selected track.
  property string openArtist: "-"
  property string openTrack: ""
  // A delete needs a second click on the same button within three seconds.
  property string armedPath: ""
  // Artist folder whose tracks are being retagged together, and its draft.
  property string editArtist: ""
  property var artistDraft: ({})

  readonly property var storage: Model.storage(garmin.status)
  readonly property bool jobFailed: garmin.job.finished && garmin.job.failed > 0
  readonly property bool reviewing: garmin.review.length > 0
  readonly property bool editing: garmin.editPath !== "" || editArtist !== ""

  visible: garmin.status.usb === true
  icon: Icons.watch
  label: garmin.working ? Math.round(Model.jobFraction(garmin.job) * 100) + "%" : ""
  tone: jobFailed ? "alert"
    : garmin.working ? "accent"
    : !garmin.connected ? "dim"
    : ""
  attention: reviewing && !popup.shown
  open: popup.shown
  onClicked: Popups.toggle("garmin", popup.screenName)

  GarminData {
    id: garmin
  }

  function toggleArtist(path) {
    openArtist = openArtist === path ? "-" : path
    openTrack = ""
    armedPath = ""
    closeEdits()
  }

  function toggleTrack(path) {
    openTrack = openTrack === path ? "" : path
    armedPath = ""
    garmin.closeEdit()
  }

  function closeEdits() {
    garmin.closeEdit()
    editArtist = ""
  }

  function startArtistEdit(artist) {
    garmin.closeEdit()
    openTrack = ""
    artistDraft = ({ artist: artist.name, album: "" })
    editArtist = artist.path
  }

  function saveArtist(artist) {
    garmin.retagArtist(artist.tracks, artistDraft.artist, artistDraft.album)
    editArtist = ""
  }

  function confirmDelete(path) {
    if (armedPath !== path) {
      armedPath = path
      disarm.restart()
      return
    }
    armedPath = ""
    garmin.remove(path)
  }

  function deleteText(path, label) {
    if (garmin.deleting === path) return "Deleting…"
    return armedPath === path ? "Confirm" : label
  }

  // The file picker is its own window; the popup closes for it and comes back
  // with the review list once the files are read.
  function addMusic() {
    Popups.close()
    garmin.pickFiles()
  }

  Connections {
    target: garmin
    // Reopened with a grab, as a bar click would, so the tag fields get
    // keyboard focus; an IPC-style open (no grab) could not be typed into.
    // Qt only grabs after the shell has had input, which the click on Add
    // music provides.
    function onReviewReady() {
      Popups.open("garmin", popup.screenName)
      grabCheck.restart()
    }
  }

  // If the grab was refused, nothing shows; close it so that one click on the
  // icon (it shows the attention dot) opens the review.
  Timer {
    id: grabCheck
    interval: 600
    onTriggered: if (popup.shown && !reviewList.Window.active) Popups.close()
  }

  Timer {
    id: disarm
    interval: 3000
    onTriggered: root.armedPath = ""
  }

  Connections {
    target: popup
    function onShownChanged() {
      if (popup.shown) return
      root.armedPath = ""
      garmin.actionError = ""
      garmin.clearJob()
      // An edit in progress stays open, with what was typed, for next time.
      if (root.editing) return
      root.openArtist = "-"
      root.openTrack = ""
    }
  }

  PopupCard {
    id: popup
    popupId: "garmin"
    anchorItem: root
    align: "right"
    cardWidth: 380
    maxBodyHeight: 560
    title: garmin.status.name || "Garmin watch"
    subtitle: !garmin.connected ? (garmin.status.error || "Connecting…")
      : root.reviewing ? "Check the tags before adding"
      : garmin.listError !== "" ? garmin.listError
      : !garmin.loaded ? "Reading music…"
      : Model.librarySummary(garmin.artists)

    onOpened: if (!root.reviewing) garmin.refresh()

    tools: [
      IconButton {
        visible: !root.reviewing
        icon: Icons.refresh
        busy: garmin.listing
        onClicked: garmin.refresh()
      },
      IconButton {
        icon: Icons.close
        onClicked: Popups.close()
      }
    ]

    Section {
      visible: root.storage !== null && !root.reviewing

      Meter {
        label: "Storage"
        value: root.storage ? root.storage.value : ""
        fraction: root.storage ? root.storage.fraction : 0
        detail: root.storage ? root.storage.detail : ""
        tone: root.storage ? root.storage.tone : ""
      }
    }

    Section {
      title: Model.jobTitle(garmin.job)
      visible: garmin.job.running || garmin.job.finished

      Meter {
        visible: garmin.working
        label: garmin.job.name || "Preparing…"
        value: (garmin.job.index + 1) + " of " + garmin.job.total
        fraction: Model.jobFraction(garmin.job)
        detail: Model.jobPhaseText(garmin.job)
      }

      Label {
        Layout.fillWidth: true
        visible: garmin.job.finished
        text: Model.jobSummary(garmin.job)
        color: garmin.job.failed > 0 ? Theme.alert : Theme.foreground
      }

      Repeater {
        model: garmin.job.problems

        Label {
          required property var modelData
          Layout.fillWidth: true
          text: (modelData.name ? modelData.name + ": " : "") + modelData.text
          color: modelData.alert ? Theme.alert : Theme.muted
          small: true
          wrapMode: Text.Wrap
          elide: Text.ElideNone
        }
      }
    }

    // Above the list, which can be long enough to scroll.
    Label {
      Layout.fillWidth: true
      Layout.leftMargin: 10
      Layout.rightMargin: 10
      visible: garmin.actionError !== ""
      text: garmin.actionError
      color: Theme.alert
      small: true
      wrapMode: Text.Wrap
      elide: Text.ElideNone
    }

    Section {
      id: allFiles
      title: "All files"
      visible: root.reviewing && Model.reviewCount(garmin.review) > 1

      RowLayout {
        Layout.fillWidth: true
        spacing: 10

        InputField {
          id: allArtist
          label: "Artist"
          placeholder: "Keep"
        }

        InputField {
          id: allAlbum
          label: "Album"
          placeholder: "Keep"
        }
      }

      RowLayout {
        Layout.fillWidth: true

        Item { Layout.fillWidth: true }

        PillButton {
          text: "Apply to all"
          enabled: allArtist.text.trim() !== "" || allAlbum.text.trim() !== ""
          onClicked: {
            garmin.applyToAll(allArtist.text, allAlbum.text)
            allArtist.text = ""
            allAlbum.text = ""
          }
        }
      }
    }

    Section {
      id: reviewList
      title: "Files to add"
      list: true
      visible: root.reviewing

      Repeater {
        model: garmin.review
        ReviewRow {}
      }
    }

    Section {
      title: "Music"
      list: true
      visible: garmin.connected && !root.reviewing

      Label {
        Layout.margins: 8
        visible: garmin.artists.length === 0
        text: garmin.loaded ? "No music on the watch" : garmin.listing ? "Reading music…" : ""
        muted: true
      }

      Repeater {
        model: garmin.artists
        ArtistRow {}
      }
    }

    footer: [
      PillButton {
        visible: root.reviewing
        text: "Cancel"
        onClicked: garmin.cancelReview()
      },
      PillButton {
        visible: root.reviewing
        text: "Add " + Model.reviewCount(garmin.review)
        icon: Icons.plus
        kind: "primary"
        enabled: garmin.connected && !garmin.working && Model.reviewCount(garmin.review) > 0
        onClicked: garmin.upload(garmin.review.map(function(item) { return item.fields }))
      },
      PillButton {
        visible: !root.reviewing
        text: garmin.working && garmin.job.kind === "add" ? "Adding…" : garmin.picking ? "Choosing…" : "Add music"
        icon: Icons.plus
        kind: "primary"
        enabled: garmin.connected && !garmin.working && !garmin.picking && garmin.deleting === ""
        onClicked: root.addMusic()
      }
    ]
  }

  // Title on its own line, then artist and album side by side. Reports
  // every change so the caller can keep a draft.
  component TagFields: ColumnLayout {
    id: fields

    property string artist: ""
    property string title: ""
    property string album: ""
    property string titlePlaceholder: "Title"

    signal edited(string key, string value)
    signal accepted()

    Layout.fillWidth: true
    spacing: 8

    InputField {
      label: "Title"
      placeholder: fields.titlePlaceholder
      text: fields.title
      onTextChanged: fields.edited("title", text)
      onAccepted: fields.accepted()
    }

    RowLayout {
      Layout.fillWidth: true
      spacing: 10

      InputField {
        label: "Artist"
        placeholder: "Unknown Artist"
        text: fields.artist
        onTextChanged: fields.edited("artist", text)
        onAccepted: fields.accepted()
      }

      InputField {
        label: "Album"
        placeholder: "Unknown"
        text: fields.album
        onTextChanged: fields.edited("album", text)
        onAccepted: fields.accepted()
      }
    }
  }

  component ReviewRow: ListRow {
    id: file

    required property var modelData
    required property int index

    icon: Icons.fileMusic
    title: modelData.name
    subtitle: Model.reviewSubtitle(modelData)
    trailing: modelData.ok ? "" : "Can't add"
    attention: !modelData.ok
    interactive: false
    expanded: modelData.ok

    TagFields {
      artist: file.modelData.fields.artist
      title: file.modelData.fields.title
      album: file.modelData.fields.album
      onEdited: function(key, value) { garmin.setReviewField(file.index, key, value) }
    }
  }

  component ArtistRow: ListRow {
    id: artist

    required property var modelData
    readonly property bool chosen: root.openArtist === modelData.path
    readonly property bool editingThis: root.editArtist !== "" && root.editArtist === modelData.path
    readonly property int editable: Model.retaggableCount(modelData.tracks)

    icon: Icons.accountMusic
    title: modelData.name || "Loose files"
    subtitle: Model.artistSubtitle(modelData)
    trailingIcon: chosen ? Icons.chevronUp : Icons.chevronDown
    selected: chosen
    expanded: chosen
    onClicked: root.toggleArtist(modelData.path)

    // Track rows bleed into the row padding so their icons line up with the artist's.
    ColumnLayout {
      Layout.fillWidth: true
      Layout.leftMargin: -8
      Layout.rightMargin: -8
      visible: !artist.editingThis
      spacing: 0

      Repeater {
        model: artist.chosen ? artist.modelData.tracks : []
        TrackRow {}
      }
    }

    ColumnLayout {
      Layout.fillWidth: true
      visible: artist.editingThis
      spacing: 8

      RowLayout {
        Layout.fillWidth: true
        spacing: 10

        InputField {
          label: "Artist"
          placeholder: "Unknown Artist"
          text: artist.editingThis ? root.artistDraft.artist : ""
          onTextChanged: if (artist.editingThis) root.artistDraft.artist = text
        }

        InputField {
          label: "Album"
          placeholder: "Keep"
          text: artist.editingThis ? root.artistDraft.album : ""
          onTextChanged: if (artist.editingThis) root.artistDraft.album = text
        }
      }

      Label {
        Layout.fillWidth: true
        text: "Retags " + Model.plural(artist.editable, "track", "tracks")
          + ". Each one is downloaded and uploaded again ("
          + Model.formatSize(artist.modelData.size) + "); titles are kept."
        muted: true
        small: true
        wrapMode: Text.Wrap
        elide: Text.ElideNone
      }
    }

    RowLayout {
      Layout.fillWidth: true
      visible: artist.modelData.path !== ""
      spacing: 6

      Item { Layout.fillWidth: true }

      PillButton {
        visible: artist.editingThis
        text: "Cancel"
        onClicked: root.editArtist = ""
      }

      PillButton {
        visible: artist.editingThis
        text: "Save"
        kind: "primary"
        enabled: !garmin.working && garmin.connected
        onClicked: root.saveArtist(artist.modelData)
      }

      PillButton {
        visible: !artist.editingThis
        text: "Edit artist"
        icon: Icons.pencilOutline
        enabled: artist.editable > 0 && !garmin.working && garmin.deleting === ""
        onClicked: root.startArtistEdit(artist.modelData)
      }

      PillButton {
        visible: !artist.editingThis
        text: root.deleteText(artist.modelData.path, "Delete artist")
        icon: Icons.deleteOutline
        kind: "danger"
        enabled: garmin.deleting === "" && !garmin.working
        onClicked: root.confirmDelete(artist.modelData.path)
      }
    }
  }

  component TrackRow: ListRow {
    id: track

    required property var modelData
    readonly property bool chosen: root.openTrack === modelData.path
    readonly property bool editingThis: garmin.editPath !== "" && garmin.editPath === modelData.path

    icon: Icons.musicNote
    title: modelData.title
    subtitle: Model.trackSubtitle(modelData)
    selected: chosen
    expanded: chosen
    onClicked: root.toggleTrack(modelData.path)

    Meter {
      visible: track.editingThis && garmin.editLoading
      label: "Reading tags"
      value: Math.round(garmin.editProgress * 100) + "%"
      fraction: garmin.editProgress
      detail: "Downloading " + Model.formatSize(track.modelData.size)
    }

    Label {
      Layout.fillWidth: true
      visible: track.editingThis && garmin.editError !== ""
      text: garmin.editError
      color: Theme.alert
      small: true
      wrapMode: Text.Wrap
      elide: Text.ElideNone
    }

    Loader {
      Layout.fillWidth: true
      active: track.editingThis && garmin.editInfo !== null
      visible: active
      sourceComponent: TagFields {
        artist: garmin.editDraft.artist || ""
        title: garmin.editDraft.title || ""
        album: garmin.editDraft.album || ""
        titlePlaceholder: track.modelData.title
        onEdited: function(key, value) { garmin.editDraft[key] = value }
        onAccepted: garmin.saveTrack(track.modelData.path, garmin.editDraft)
      }
    }

    RowLayout {
      Layout.fillWidth: true
      spacing: 6

      Item { Layout.fillWidth: true }

      PillButton {
        visible: track.editingThis
        text: "Cancel"
        onClicked: garmin.closeEdit()
      }

      PillButton {
        visible: track.editingThis
        text: "Save"
        kind: "primary"
        enabled: garmin.editInfo !== null && !garmin.working && garmin.connected
        onClicked: garmin.saveTrack(track.modelData.path, garmin.editDraft)
      }

      PillButton {
        visible: !track.editingThis
        text: "Edit"
        icon: Icons.pencilOutline
        enabled: Model.canRetag(track.modelData.path) && !garmin.working && garmin.deleting === ""
        onClicked: {
          root.editArtist = ""
          garmin.startEdit(track.modelData.path)
        }
      }

      PillButton {
        visible: !track.editingThis
        text: root.deleteText(track.modelData.path, "Delete track")
        icon: Icons.deleteOutline
        kind: "danger"
        enabled: garmin.deleting === "" && !garmin.working
        onClicked: root.confirmDelete(track.modelData.path)
      }
    }
  }
}

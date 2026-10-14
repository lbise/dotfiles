import QtQuick
import Quickshell
import Quickshell.Io
import "GarminModel.js" as Model

// The Garmin watch over USB, through system-garmin-music.py. A long-running
// `watch` process reports plug and unplug (no polling); the music list is
// read on demand. Uploads and retags run one job at a time and report
// progress line by line.
Item {
  id: root

  property var status: Model.offlineStatus()
  property var artists: []
  property bool loaded: false
  property string listError: ""
  // A refresh asked for while a list is running; it would miss the change.
  property bool refreshQueued: false
  property var job: Model.idleJob()
  // Path being deleted, "" when idle.
  property string deleting: ""
  property string actionError: ""

  // Files picked for upload, waiting for their tags to be reviewed.
  property var review: []
  // A track on the watch being edited: its path, and its tags once read.
  property string editPath: ""
  property var editInfo: null
  property real editProgress: 0
  property string editError: ""
  // What has been typed into the edit form, so a list refresh that rebuilds
  // the rows (or closing the popup) does not lose it. Mutated in place.
  property var editDraft: ({})

  readonly property bool connected: status.connected === true
  readonly property bool listing: listProcess.running
  readonly property bool picking: pickProcess.running || probeProcess.running
  readonly property bool working: job.running
  readonly property bool editLoading: editPath !== "" && editInfo === null && editError === ""
  readonly property string script: (Quickshell.env("HOME") || "") + "/.scripts/system/system-garmin-music.py"

  // The picked files are probed and ready to review.
  signal reviewReady()

  onConnectedChanged: {
    if (!connected) {
      artists = []
      loaded = false
      listError = ""
      closeEdit()
    }
  }

  function refresh() {
    if (!connected) return
    if (listProcess.running) refreshQueued = true
    else listProcess.running = true
  }

  function pickFiles() {
    if (!connected || working || picking) return
    actionError = ""
    pickProcess.running = true
  }

  function cancelReview() {
    review = []
  }

  // Typing updates the row in place, so the list is not rebuilt under the cursor.
  function setReviewField(index, key, value) {
    if (review[index]) review[index].fields[key] = value
  }

  // Rebuilds the rows with the new values; an empty album is left as it was.
  function applyToAll(artist, album) {
    for (var i = 0; i < review.length; i++) {
      if (String(artist).trim() !== "") review[i].fields.artist = String(artist).trim()
      if (String(album).trim() !== "") review[i].fields.album = String(album).trim()
    }
    review = review.slice()
  }

  // values[i] holds the edited fields of review[i].
  function upload(values) {
    var manifest = Model.addManifest(review, values)
    if (manifest.length === 0 || !runJob("add", manifest)) return
    review = []
  }

  function startEdit(path) {
    if (working) return
    editPath = path
    editInfo = null
    editError = ""
    editProgress = 0
    editDraft = ({})
    // A previous read still running finishes on its own; its result is ignored.
    if (!probeRemoteProcess.running) readTags()
  }

  function readTags() {
    probeRemoteProcess.path = editPath
    probeRemoteProcess.command = [root.script, "probe-remote", editPath]
    probeRemoteProcess.running = true
  }

  function closeEdit() {
    editPath = ""
    editInfo = null
    editError = ""
  }

  function saveTrack(path, fields) {
    if (runJob("edit", Model.trackManifest(path, fields))) closeEdit()
  }

  function retagArtist(tracks, artist, album) {
    runJob("edit", Model.artistManifest(tracks, artist, album))
  }

  function runJob(kind, manifest) {
    if (jobProcess.running || manifest.length === 0) return false
    actionError = ""
    job = Model.startJob(kind, manifest.length)
    jobProcess.manifest = JSON.stringify(manifest)
    jobProcess.command = [root.script, kind === "add" ? "add" : "retag", "--manifest", "-"]
    jobProcess.stdinEnabled = true
    jobProcess.running = true
    return true
  }

  function remove(path) {
    if (deleting !== "" || working || removeProcess.running) return
    actionError = ""
    deleting = path
    removeProcess.command = [root.script, "rm", path]
    removeProcess.running = true
  }

  function clearJob() {
    if (!working) job = Model.idleJob()
  }

  function applyList(text) {
    var result = Model.parseJson(text, { ok: false, error: "Could not read the watch", artists: [] })
    if (result.device && result.device.connected) status = result.device
    listError = result.ok ? "" : result.error || "Could not read the watch"
    if (result.ok) {
      artists = result.artists || []
      loaded = true
    }
  }

  // Plug and unplug; restarted if it ever exits.
  Process {
    id: watchProcess
    command: [root.script, "watch"]
    running: true
    stdout: SplitParser {
      onRead: function(line) {
        var next = Model.parseJson(line, null)
        if (next) root.status = next
      }
    }
    stderr: StdioCollector { waitForEnd: true }
    onExited: watchRestart.restart()
  }

  Timer {
    id: watchRestart
    interval: 5000
    onTriggered: watchProcess.running = true
  }

  Process {
    id: listProcess
    command: [root.script, "list"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.applyList(text)
    }
    stderr: StdioCollector { waitForEnd: true }
    onExited: {
      if (!root.refreshQueued) return
      root.refreshQueued = false
      root.refresh()
    }
  }

  Process {
    id: pickProcess
    command: [
      "zenity", "--file-selection", "--multiple", "--separator=\n",
      "--title=Add music to " + (root.status.name || "the watch"),
      "--file-filter=Audio | *.mp3 *.m4a *.aac *.flac *.ogg *.oga *.opus *.wav *.MP3 *.M4A *.AAC *.FLAC *.OGG *.OGA *.OPUS *.WAV",
      "--file-filter=All files | *"
    ]
    stdout: StdioCollector {
      id: pickOutput
      waitForEnd: true
    }
    stderr: StdioCollector { waitForEnd: true }
    // zenity exits 1 when cancelled; anything else is a real failure.
    onExited: function(exitCode, exitStatus) {
      var files = Model.pickedFiles(pickOutput.text)
      if (exitCode === 0 && files.length > 0) {
        probeProcess.command = [root.script, "probe"].concat(files)
        probeProcess.running = true
      } else if (exitCode !== 0 && exitCode !== 1) {
        root.actionError = "Could not open the file picker (zenity exited " + exitCode + ")"
      }
    }
  }

  Process {
    id: probeProcess
    stdout: StdioCollector {
      id: probeOutput
      waitForEnd: true
    }
    stderr: StdioCollector {
      id: probeErrors
      waitForEnd: true
    }
    onExited: function(exitCode, exitStatus) {
      var items = Model.reviewItems(probeOutput.text)
      if (items === null) {
        root.actionError = String(probeErrors.text || "").trim().split("\n").pop() || "Could not read the picked files"
      } else {
        root.review = items
      }
      root.reviewReady()
    }
  }

  Process {
    id: probeRemoteProcess
    property string path: ""
    stdout: SplitParser {
      onRead: function(line) {
        var event = Model.parseJson(line, null)
        if (!event || probeRemoteProcess.path !== root.editPath) return
        if (event.event === "progress") root.editProgress = event.total > 0 ? event.sent / event.total : 0
        else if (event.event === "result" && event.ok) {
          root.editDraft = Object.assign({}, event.fields)
          root.editInfo = event
        }
        else if (event.event === "result") root.editError = event.error || "Could not read the track"
      }
    }
    stderr: StdioCollector {
      id: probeRemoteErrors
      waitForEnd: true
    }
    onExited: function(exitCode, exitStatus) {
      if (probeRemoteProcess.path !== root.editPath) {
        // The edit moved on to another track while this one was read.
        if (root.editPath !== "") root.readTags()
        return
      }
      if (root.editInfo === null && root.editError === "")
        root.editError = String(probeRemoteErrors.text || "").trim().split("\n").pop() || "Could not read the track"
    }
  }

  Process {
    id: jobProcess
    property string manifest: ""
    onStarted: {
      write(manifest + "\n")
      stdinEnabled = false
    }
    stdout: SplitParser {
      onRead: function(line) {
        var event = Model.parseJson(line, null)
        if (event && event.event) root.job = Model.applyJobEvent(root.job, event)
      }
    }
    stderr: StdioCollector {
      id: jobErrors
      waitForEnd: true
    }
    onExited: function(exitCode, exitStatus) {
      if (!root.job.finished) {
        var message = String(jobErrors.text || "").trim().split("\n").pop() || "The job stopped unexpectedly"
        root.job = Model.applyJobEvent(root.job, { event: "failed", index: -1, name: "", error: message })
        root.job = Model.applyJobEvent(root.job, {
          event: "finished", done: root.job.done, skipped: root.job.skipped, failed: root.job.failed
        })
      }
      root.refresh()
    }
  }

  Process {
    id: removeProcess
    stdout: StdioCollector {
      id: removeOutput
      waitForEnd: true
    }
    stderr: StdioCollector {
      id: removeErrors
      waitForEnd: true
    }
    onExited: function(exitCode, exitStatus) {
      var result = Model.parseJson(removeOutput.text, { ok: false, error: String(removeErrors.text || "").trim() })
      if (exitCode !== 0 || !result.ok) root.actionError = result.error || "Could not delete from the watch"
      root.deleting = ""
      root.refresh()
    }
  }
}

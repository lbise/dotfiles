// Pure helpers for the Garmin watch widget. The device work happens in
// scripts/system/system-garmin-music.py; this shapes its JSON for the popup.

function parseJson(text, fallback) {
  try {
    var value = JSON.parse(String(text || "").trim())
    return value && typeof value === "object" ? value : fallback
  } catch (error) {
    return fallback
  }
}

function offlineStatus() {
  return { connected: false, usb: false, name: "", storage: "", free: 0, capacity: 0, error: "" }
}

function formatSize(bytes) {
  bytes = Number(bytes) || 0
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB"
  if (bytes >= 1048576) return Math.round(bytes / 1048576) + " MB"
  return Math.max(1, Math.round(bytes / 1024)) + " KB"
}

function plural(count, one, many) {
  return count + " " + (count === 1 ? one : many)
}

// { fraction, value, detail, tone } for the storage meter, or null when unknown.
function storage(status) {
  var capacity = Number(status && status.capacity) || 0
  if (capacity <= 0) return null
  var free = Math.max(0, Math.min(capacity, Number(status.free) || 0))
  var fraction = (capacity - free) / capacity
  return {
    fraction: fraction,
    value: Math.round(fraction * 100) + "%",
    detail: formatSize(free) + " free of " + formatSize(capacity),
    tone: fraction >= 0.9 ? "alert" : fraction >= 0.75 ? "warn" : ""
  }
}

function trackCount(artists) {
  var count = 0
  for (var i = 0; i < (artists || []).length; i++) count += artists[i].count
  return count
}

function librarySummary(artists) {
  var named = (artists || []).filter(function(artist) { return artist.path !== "" }).length
  return plural(trackCount(artists), "track", "tracks") + " · " + plural(named, "artist", "artists")
}

function artistSubtitle(artist) {
  if (artist.count === 0) return "Empty folder"
  return plural(artist.count, "track", "tracks") + " · " + formatSize(artist.size)
}

function trackSubtitle(track) {
  return (track.album ? track.album + " · " : "") + formatSize(track.size)
}

// The watch plays these, and the backend can rewrite their tags.
function canRetag(path) {
  return /\.(mp3|m4a|aac)$/i.test(String(path || ""))
}

function retaggableCount(tracks) {
  return (tracks || []).filter(function(track) { return canRetag(track.path) }).length
}

// Upload and retag jobs ------------------------------------------------------

function idleJob() {
  return {
    kind: "", running: false, finished: false, total: 0, index: 0, name: "", phase: "",
    fraction: 0, done: 0, skipped: 0, failed: 0, problems: []
  }
}

// kind is "add" or "edit".
function startJob(kind, total) {
  var job = idleJob()
  job.kind = kind
  job.running = true
  job.total = total
  job.phase = "reading"
  return job
}

// Folds one JSON event line from `add` or `retag` into the state.
function applyJobEvent(state, event) {
  var next = Object.assign({}, state)
  next.problems = (state.problems || []).slice()
  switch (event.event) {
  case "start":
    next = startJob(state.kind, event.total)
    break
  case "file":
    next.index = event.index
    next.name = event.name
    next.phase = "reading"
    next.fraction = 0
    break
  case "phase":
    next.phase = event.phase
    next.fraction = 0
    break
  case "progress":
    next.fraction = event.total > 0 ? Math.min(1, event.sent / event.total) : 0
    break
  case "done":
    next.done += 1
    next.fraction = 1
    break
  case "skipped":
    next.skipped += 1
    next.problems.push({ name: event.name, text: event.reason, alert: false })
    break
  case "failed":
    next.failed += event.index < 0 ? Math.max(1, state.total - state.done - state.skipped - state.failed) : 1
    next.problems.push({ name: event.name || "", text: event.error, alert: true })
    break
  case "finished":
    next.running = false
    next.finished = true
    next.done = event.done
    next.skipped = event.skipped
    next.failed = event.failed
    next.fraction = 1
    break
  }
  return next
}

// Share of the current file that is done: an edit downloads, then uploads.
function fileFraction(state) {
  if (state.kind === "edit") {
    if (state.phase === "downloading") return state.fraction / 2
    if (state.phase === "tagging") return 0.5
    if (state.phase === "uploading") return 0.5 + state.fraction / 2
    return 0
  }
  return state.phase === "uploading" ? state.fraction : 0
}

// Share of the whole job that is done, 0 to 1.
function jobFraction(state) {
  if (state.finished) return 1
  if (!(state.total > 0)) return 0
  return Math.max(0, Math.min(1, (state.index + fileFraction(state)) / state.total))
}

function jobPhaseText(state) {
  var percent = Math.round(state.fraction * 100) + "%"
  if (state.phase === "converting") return "Converting to MP3…"
  if (state.phase === "tagging") return "Writing tags…"
  if (state.phase === "downloading") return "Downloading " + percent
  if (state.phase === "uploading") return "Uploading " + percent
  return "Reading tags…"
}

function jobTitle(state) {
  if (state.kind === "edit") return state.running ? "Updating" : "Updated"
  return state.running ? "Adding" : "Added"
}

function jobSummary(state) {
  var parts = []
  if (state.done > 0) parts.push(state.done + (state.kind === "edit" ? " updated" : " added"))
  if (state.skipped > 0) parts.push(state.skipped + " skipped")
  if (state.failed > 0) parts.push(state.failed + " failed")
  return parts.join(" · ") || "Nothing changed"
}

// Review before upload -------------------------------------------------------

// zenity prints one path per line.
function pickedFiles(text) {
  return String(text || "").split("\n").filter(function(line) { return line !== "" })
}

// Rows for the review list from `probe` output.
function reviewItems(text) {
  var result = parseJson(text, null)
  if (!result || !Array.isArray(result.files)) return null
  return result.files.map(function(file) {
    var fields = file.fields || {}
    return {
      source: file.source,
      name: file.name,
      ok: file.ok === true,
      error: file.error || "",
      from: file.from || "",
      to: file.to || "",
      size: file.size || 0,
      fields: { artist: fields.artist || "", title: fields.title || "", album: fields.album || "" }
    }
  })
}

function reviewSubtitle(item) {
  if (!item.ok) return item.error
  var format = item.from === item.to ? item.to : item.from + " → " + item.to
  return format + " · " + formatSize(item.size)
}

function reviewCount(items) {
  return (items || []).filter(function(item) { return item.ok }).length
}

// values[i] holds the edited { artist, title, album } of items[i].
function addManifest(items, values) {
  var manifest = []
  for (var i = 0; i < items.length; i++) {
    if (!items[i].ok) continue
    manifest.push({
      source: items[i].source,
      artist: String(values[i].artist || "").trim(),
      title: String(values[i].title || "").trim(),
      album: String(values[i].album || "").trim()
    })
  }
  return manifest
}

// Retag every track of an artist; an empty album keeps each track's own.
function artistManifest(tracks, artist, album) {
  return (tracks || []).filter(function(track) { return canRetag(track.path) }).map(function(track) {
    var item = { path: track.path, artist: String(artist || "").trim() }
    if (String(album || "").trim() !== "") item.album = String(album).trim()
    return item
  })
}

function trackManifest(path, fields) {
  return [{
    path: path,
    artist: String(fields.artist || "").trim(),
    title: String(fields.title || "").trim(),
    album: String(fields.album || "").trim()
  }]
}

if (typeof module !== "undefined") {
  module.exports = {
    parseJson: parseJson,
    offlineStatus: offlineStatus,
    formatSize: formatSize,
    storage: storage,
    trackCount: trackCount,
    librarySummary: librarySummary,
    artistSubtitle: artistSubtitle,
    trackSubtitle: trackSubtitle,
    canRetag: canRetag,
    retaggableCount: retaggableCount,
    idleJob: idleJob,
    startJob: startJob,
    applyJobEvent: applyJobEvent,
    jobFraction: jobFraction,
    jobPhaseText: jobPhaseText,
    jobTitle: jobTitle,
    jobSummary: jobSummary,
    pickedFiles: pickedFiles,
    reviewItems: reviewItems,
    reviewSubtitle: reviewSubtitle,
    reviewCount: reviewCount,
    addManifest: addManifest,
    artistManifest: artistManifest,
    trackManifest: trackManifest
  }
}

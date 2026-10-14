function list(text) {
  try {
    var value = JSON.parse(String(text || "").trim() || "[]")
    return Array.isArray(value) ? value : []
  } catch (error) {
    return []
  }
}

// What the copy button puts on the clipboard: summary, a blank line, body.
function copyText(summary, body) {
  return [summary, body].filter(function(part) { return part !== "" }).join("\n\n")
}

function entry(item, active) {
  var summary = String(item.summary || "").trim()
  var body = String(item.body || "").trim()
  return {
    id: Number(item.id) || 0,
    app: String(item.app_name || ""),
    summary: summary,
    // `body` keeps its line breaks for the expanded row; `preview` is one
    // paragraph for the collapsed row.
    body: body,
    preview: body.replace(/\s*\n\s*/g, " "),
    copyText: copyText(summary, body),
    critical: item.urgency === "critical",
    active: active
  }
}

// Output of `makoctl mode`, `makoctl history -j` and `makoctl list -j`,
// separated by "---" lines. Newest first; a notification still on screen is
// marked active.
function parse(text) {
  var parts = String(text).split(/^---$/m)
  var modes = String(parts[0] || "").split(/\s+/)
  var seen = {}
  var entries = []
  list(parts[2]).forEach(function(item) {
    var value = entry(item, true)
    seen[value.id] = true
    entries.push(value)
  })
  list(parts[1]).forEach(function(item) {
    var value = entry(item, false)
    if (!seen[value.id]) entries.push(value)
  })
  entries.sort(function(left, right) { return right.id - left.id })
  return { dnd: modes.indexOf("do-not-disturb") !== -1, entries: entries }
}

function maxId(entries) {
  return entries.length > 0 ? entries[0].id : 0
}

function unread(entries, seenId) {
  return entries.filter(function(item) { return item.id > seenId }).length
}

if (typeof module !== "undefined") {
  module.exports = { parse: parse, maxId: maxId, unread: unread, copyText: copyText }
}

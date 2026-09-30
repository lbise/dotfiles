// /proc/stat counters include guest time in user/nice already.
function cpuSample(text) {
  var match = /^cpu\s+(.+)$/m.exec(text)
  if (!match) return null
  var fields = match[1].trim().split(/\s+/).map(Number)
  if (fields.length < 4 || fields.some(function(n) { return !isFinite(n) || n < 0 })) return null
  var total = fields.slice(0, 8).reduce(function(sum, n) { return sum + n }, 0)
  return { total: total, idle: fields[3] + (fields[4] || 0) }
}

function cpuUsage(previous, current) {
  if (!previous || !current) return -1
  var total = current.total - previous.total
  var idle = current.idle - previous.idle
  if (total <= 0 || idle < 0) return -1
  return Math.max(0, Math.min(1, (total - idle) / total))
}

function memory(text) {
  var fields = {}
  text.split("\n").forEach(function(line) {
    var match = /^(\w+):\s+(\d+)\s+kB$/.exec(line.trim())
    if (match) fields[match[1]] = Number(match[2]) * 1024
  })
  if (!(fields.MemTotal > 0) || fields.MemAvailable === undefined) return null
  return {
    total: fields.MemTotal,
    used: Math.max(0, fields.MemTotal - fields.MemAvailable),
    swapTotal: fields.SwapTotal || 0,
    swapUsed: Math.max(0, (fields.SwapTotal || 0) - (fields.SwapFree || 0))
  }
}

function gib(bytes) {
  return (bytes / 1073741824).toFixed(1) + " GiB"
}

function coreCount(text) {
  var matches = text.match(/^cpu\d+\s/gm)
  return matches ? matches.length : 0
}

// "0.52 0.61 0.70 ..." from /proc/loadavg.
function loadAverage(text) {
  var fields = text.trim().split(/\s+/).slice(0, 3).map(Number)
  if (fields.length < 3 || fields.some(function(n) { return !isFinite(n) || n < 0 })) return null
  return { one: fields[0], five: fields[1], fifteen: fields[2] }
}

function load(value) {
  return value.toFixed(2)
}

// "name millidegrees" lines, one per hwmon device. Returns Celsius readings:
// { cpu, gpu, disks: [...] }, with -1 for a missing cpu or gpu.
function temperatures(text) {
  var result = { cpu: -1, gpu: -1, disks: [] }
  String(text).split("\n").forEach(function(line) {
    var match = /^(\S+)\s+(\d+)\s*$/.exec(line)
    if (!match) return
    var degrees = Number(match[2]) / 1000
    if (!(degrees > 0)) return
    var name = match[1]
    if (name === "k10temp" || name === "coretemp" || name === "zenpower") {
      if (result.cpu < 0) result.cpu = degrees
    } else if (name === "amdgpu" || name === "nouveau") {
      if (result.gpu < 0) result.gpu = degrees
    } else if (name === "nvme") {
      result.disks.push(degrees)
    }
  })
  return result
}

// `df -B1 --output=size,used,target` lines, one per distinct mount.
function disks(text) {
  var rows = []
  var seen = {}
  String(text).split("\n").forEach(function(line) {
    var match = /^\s*(\d+)\s+(\d+)\s+(\/\S*)\s*$/.exec(line)
    if (!match || seen[match[3]] || Number(match[1]) <= 0) return
    seen[match[3]] = true
    rows.push({ mount: match[3], total: Number(match[1]), used: Number(match[2]) })
  })
  return rows
}

// "3d 4h", "5h 12m" or "9m": two units are enough for an uptime.
function uptime(text) {
  var seconds = Number(text.trim().split(/\s+/)[0])
  if (!text.trim() || !isFinite(seconds) || seconds < 0) return ""
  var minutes = Math.floor(seconds / 60)
  var days = Math.floor(minutes / 1440)
  var hours = Math.floor(minutes / 60) % 24
  if (days) return days + "d " + hours + "h"
  if (hours) return hours + "h " + (minutes % 60) + "m"
  return minutes + "m"
}

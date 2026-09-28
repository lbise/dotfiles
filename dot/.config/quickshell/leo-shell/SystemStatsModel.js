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

function uptime(text) {
  var seconds = Number(text.trim().split(/\s+/)[0])
  if (!text.trim() || !isFinite(seconds) || seconds < 0) return "Unavailable"
  var minutes = Math.floor(seconds / 60)
  var days = Math.floor(minutes / 1440)
  var hours = Math.floor(minutes / 60) % 24
  return (days ? days + "d " : "") + hours + "h " + (minutes % 60) + "m"
}

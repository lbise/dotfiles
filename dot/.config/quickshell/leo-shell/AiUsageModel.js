function parseRecord(content) {
  try {
    var record = JSON.parse(String(content || ""))
    return record && typeof record === "object" ? record : null
  } catch (error) {
    return null
  }
}

function tokenBucketTotal(bucket) {
  if (!bucket || typeof bucket !== "object") return 0
  return number(bucket.inputTokens) + number(bucket.outputTokens)
    + number(bucket.cacheReadInputTokens) + number(bucket.cacheCreationInputTokens)
}

function number(value) {
  var parsed = Number(value)
  return isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0
}

function totalTokens(record) {
  if (!record) return 0
  var direct = number(record.todayTotalTokens)
  if (direct > 0) return direct
  var total = 0
  var usage = record.modelUsage || {}
  for (var model in usage) total += tokenBucketTotal(usage[model])
  return total
}

function modelRows(record) {
  var rows = []
  var usage = record && record.modelUsage ? record.modelUsage : {}
  for (var model in usage) {
    var tokens = tokenBucketTotal(usage[model])
    if (tokens > 0) rows.push({ model: model, tokens: tokens, bucket: usage[model] })
  }
  rows.sort(function(left, right) { return right.tokens - left.tokens })
  var maximum = rows.length > 0 ? rows[0].tokens : 1
  for (var j = 0; j < rows.length; j++) rows[j].fraction = rows[j].tokens / maximum
  return rows
}

function limitRows(record) {
  var rows = []
  var limits = record && Array.isArray(record.limits) ? record.limits : []
  for (var i = 0; i < limits.length; i++) {
    var limit = limits[i] || {}
    var percent = Number(limit.percent)
    if (!isFinite(percent) || percent < 0) continue
    if (percent > 1) percent /= 100
    rows.push({
      label: String(limit.label || "Quota"),
      percent: Math.max(0, Math.min(1, percent)),
      resetsAt: String(limit.resetsAt || "")
    })
  }
  return rows
}

function usable(record) {
  return !!record && (totalTokens(record) > 0 || modelRows(record).length > 0 || limitRows(record).length > 0)
}

// The favourite provider sorts first, then the rest by tokens.
function recordRows(records, favorite) {
  var rows = []
  for (var id in records) {
    var record = records[id]
    if (!usable(record)) continue
    rows.push({
      id: id,
      record: record,
      models: modelRows(record),
      limits: limitRows(record),
      tokens: totalTokens(record)
    })
  }
  rows.sort(function(left, right) {
    if ((left.id === favorite) !== (right.id === favorite)) return left.id === favorite ? -1 : 1
    return right.tokens - left.tokens || (left.id < right.id ? -1 : 1)
  })
  return rows
}

function formatTokens(value) {
  var tokens = number(value)
  // 999.5k and up round to 1000k, so they move to the next unit.
  if (tokens >= 999500000) return scaled(tokens / 1000000000) + "B"
  if (tokens >= 999500) return scaled(tokens / 1000000) + "M"
  if (tokens >= 1000) return scaled(tokens / 1000) + "k"
  return String(tokens)
}

// One decimal below 100, none above, so values stay short ("45.6M", "116M").
function scaled(value) {
  return value >= 100 ? value.toFixed(0) : value.toFixed(1)
}

function formatPercent(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100) + "%"
}

function resetText(value) {
  if (!value) return ""
  var date = new Date(value)
  if (!isFinite(date.getTime())) return ""
  return "resets " + Qt.formatDateTime(date, "d MMM, HH:mm")
}

if (typeof module !== "undefined") {
  module.exports = {
    parseRecord: parseRecord,
    tokenBucketTotal: tokenBucketTotal,
    totalTokens: totalTokens,
    modelRows: modelRows,
    limitRows: limitRows,
    recordRows: recordRows,
    formatTokens: formatTokens,
    formatPercent: formatPercent
  }
}

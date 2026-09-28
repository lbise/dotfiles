function splitTerseLine(line) {
  var fields = []
  var field = ""
  var escaped = false

  for (var i = 0; i < line.length; i++) {
    var char = line[i]
    if (escaped) {
      field += char
      escaped = false
    } else if (char === "\\") {
      escaped = true
    } else if (char === ":") {
      fields.push(field)
      field = ""
    } else {
      field += char
    }
  }
  if (escaped) field += "\\"
  fields.push(field)
  return fields
}

function numberOr(value, fallback) {
  var number = Number(value)
  return isFinite(number) ? number : fallback
}

function parseNetworks(output) {
  var networks = []
  String(output || "").split("\n").forEach(function(line) {
    if (!line.trim()) return
    var fields = splitTerseLine(line)
    if (fields.length < 7) return

    var ssid = fields[1]
    if (!ssid) ssid = "Hidden network"
    networks.push({
      inUse: fields[0] === "*" || fields[0].toLowerCase() === "yes",
      ssid: ssid,
      channel: fields[2] || "-",
      rate: fields[3] || "-",
      signal: numberOr(fields[4], 0),
      bars: fields[5] || "",
      security: fields[6] === "--" || fields[6] === "" ? "Open" : fields[6]
    })
  })

  networks.sort(function(left, right) {
    if (left.inUse !== right.inUse) return left.inUse ? -1 : 1
    return right.signal - left.signal
  })
  return networks
}

function parseDeviceStatus(output) {
  var devices = []
  String(output || "").split("\n").forEach(function(line) {
    if (!line.trim()) return
    var fields = splitTerseLine(line)
    if (fields.length < 4) return
    devices.push({
      device: fields[0],
      type: fields[1],
      state: fields[2],
      connection: fields.slice(3).join(":")
    })
  })

  for (var i = 0; i < devices.length; i++) {
    var device = devices[i]
    if ((device.type === "wifi" || device.type === "802-11-wireless")
      && device.state.toLowerCase().indexOf("connected") === 0) return device
  }
  return null
}

function parseDetails(output) {
  var details = { address: "", gateway: "" }
  String(output || "").split("\n").forEach(function(line) {
    var fields = splitTerseLine(line)
    if (fields.length < 2) return
    if (fields[0].indexOf("IP4.ADDRESS") === 0 && !details.address) details.address = fields[1]
    if (fields[0] === "IP4.GATEWAY" && !details.gateway) details.gateway = fields[1]
  })
  return details
}

if (typeof module !== "undefined") {
  module.exports = {
    splitTerseLine: splitTerseLine,
    parseNetworks: parseNetworks,
    parseDeviceStatus: parseDeviceStatus,
    parseDetails: parseDetails
  }
}

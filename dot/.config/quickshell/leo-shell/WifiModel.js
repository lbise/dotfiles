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
      hidden: !fields[1],
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

// One entry per SSID, keeping the strongest access point (the list is
// already sorted connected first, then by signal). Hidden networks stay.
function uniqueNetworks(networks) {
  var seen = {}
  return (networks || []).filter(function(network) {
    if (network.hidden) return true
    if (seen[network.ssid]) return false
    seen[network.ssid] = true
    return true
  })
}

// 1 to 4 bars for a signal percentage.
function signalLevel(signal) {
  if (signal >= 75) return 4
  if (signal >= 50) return 3
  if (signal >= 25) return 2
  return 1
}

function parseDevices(output) {
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
  return devices
}

function isConnected(device) {
  return device.state.toLowerCase().indexOf("connected") === 0
}

function isWifi(device) {
  return device.type === "wifi" || device.type === "802-11-wireless"
}

// What the bar needs from `nmcli device status`: the Wi-Fi device (if any),
// and the connected Wi-Fi and ethernet devices.
function summarizeDevices(output) {
  var devices = parseDevices(output)
  var summary = { wifiDevice: null, wifi: null, ethernet: null }
  devices.forEach(function(device) {
    if (isWifi(device)) {
      if (!summary.wifiDevice) summary.wifiDevice = device
      if (!summary.wifi && isConnected(device)) summary.wifi = device
    } else if ((device.type === "ethernet" || device.type === "802-3-ethernet")
      && !summary.ethernet && isConnected(device)) {
      summary.ethernet = device
    }
  })
  return summary
}

function parseDeviceStatus(output) {
  var devices = parseDevices(output)
  for (var i = 0; i < devices.length; i++) {
    var device = devices[i]
    if (isWifi(device) && isConnected(device)) return device
  }
  return null
}

function parseDetails(output) {
  var details = { address: "", gateway: "", speed: "" }
  String(output || "").split("\n").forEach(function(line) {
    var fields = splitTerseLine(line)
    if (fields.length < 2) return
    if (fields[0].indexOf("IP4.ADDRESS") === 0 && !details.address) details.address = fields[1]
    if (fields[0] === "IP4.GATEWAY" && !details.gateway) details.gateway = fields[1]
    if (fields[0] === "CAPABILITIES.SPEED" && fields[1] !== "unknown") details.speed = fields[1]
  })
  return details
}

if (typeof module !== "undefined") {
  module.exports = {
    splitTerseLine: splitTerseLine,
    parseNetworks: parseNetworks,
    uniqueNetworks: uniqueNetworks,
    signalLevel: signalLevel,
    parseDevices: parseDevices,
    summarizeDevices: summarizeDevices,
    parseDeviceStatus: parseDeviceStatus,
    parseDetails: parseDetails
  }
}

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

// Splits helper output at lines holding only "---" into `count` sections; the
// last section keeps any further separators. Missing sections are "".
function sections(text, count) {
  var result = [[]]
  String(text || "").split("\n").forEach(function(line) {
    if (line === "---" && result.length < count) result.push([])
    else result[result.length - 1].push(line)
  })
  while (result.length < count) result.push([])
  return result.map(function(lines) { return lines.join("\n") })
}

// "name millidegrees" lines, one per hwmon device. Returns Celsius readings
// { cpu, gpu }, with -1 for a missing sensor. Drive sensors are read per drive.
function temperatures(text) {
  var result = { cpu: -1, gpu: -1 }
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
    }
  })
  return result
}

// Binary size with a short unit: "100 MiB", "18.5 GiB", "466 GiB", "1.8 TiB".
// Values from GiB up keep one decimal below 100.
function size(bytes) {
  var units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"]
  var value = Math.max(0, Number(bytes) || 0)
  var unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return (unit < 3 || value >= 100 ? Math.round(value) : value.toFixed(1)) + " " + units[unit]
}

var transports = { nvme: "NVMe", sata: "SATA", ata: "ATA", sas: "SAS", usb: "USB",
  mmc: "MMC", virtio: "VirtIO", scsi: "SCSI", iscsi: "iSCSI", fc: "FC" }

// "block-device millidegrees" lines from /sys/block/*/device/hwmon*.
function driveTemperatures(text) {
  var result = {}
  String(text).split("\n").forEach(function(line) {
    var match = /^(\S+)\s+(\d+)\s*$/.exec(line)
    if (match && Number(match[2]) > 0 && result[match[1]] === undefined)
      result[match[1]] = Number(match[2]) / 1000
  })
  return result
}

function mountpoints(node) {
  var list = node.mountpoints || (node.mountpoint !== undefined ? [node.mountpoint] : [])
  return list.filter(function(mount) { return typeof mount === "string" && mount !== "" })
}

// Every filesystem on a drive, looking through partitions, LUKS and LVM.
// Mounted ones carry usage; the rest are listed by name, type and size.
function collect(node, drive) {
  var mounts = mountpoints(node)
  var children = node.children || []
  var paths = mounts.filter(function(mount) { return mount.charAt(0) === "/" })
  if (paths.length > 0 && Number(node.fssize) > 0) {
    drive.filesystems.push({
      mounts: paths,
      device: node.name,
      fstype: node.fstype || "",
      total: Number(node.fssize),
      used: Math.max(0, Number(node.fsused) || 0)
    })
  } else if (mounts.indexOf("[SWAP]") >= 0) {
    drive.swap.push({ device: node.name, size: Number(node.size) || 0 })
  } else if (children.length === 0 && node.fstype) {
    drive.unmounted.push({
      device: node.name,
      fstype: node.fstype,
      label: node.label || "",
      size: Number(node.size) || 0
    })
  }
  children.forEach(function(child) { collect(child, drive) })
}

// `lsblk -J -b` output plus per-drive temperatures, one entry per physical
// drive. The drive holding / comes first, then drives with mounts, by name.
function drives(json, temperatureText) {
  var data
  try {
    data = JSON.parse(String(json || ""))
  } catch (error) {
    return []
  }
  var temperatures = driveTemperatures(temperatureText)
  var result = []
  ;(data && data.blockdevices || []).forEach(function(node) {
    if (node.type !== "disk" || /^(zram|ram|loop)/.test(node.name)) return
    var drive = {
      node: node,
      name: node.name,
      model: String(node.model || "").trim(),
      transport: transports[node.tran] || String(node.tran || "").toUpperCase(),
      removable: node.rm === true || node.rm === "1",
      rotational: node.rota === true || node.rota === "1",
      size: Number(node.size) || 0,
      temperature: temperatures[node.name] !== undefined ? temperatures[node.name] : -1,
      filesystems: [],
      swap: [],
      unmounted: []
    }
    collect(node, drive)
    delete drive.node
    drive.system = drive.filesystems.some(function(fs) { return fs.mounts.indexOf("/") >= 0 })
    result.push(drive)
  })
  return result.sort(function(a, b) {
    if (a.system !== b.system) return a.system ? -1 : 1
    var aMounted = a.filesystems.length > 0, bMounted = b.filesystems.length > 0
    if (aMounted !== bMounted) return aMounted ? -1 : 1
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })
}

// "NVMe · SSD · 1.8 TiB" under the drive's model name.
function driveSummary(drive) {
  var parts = []
  if (drive.removable) parts.push("Removable")
  if (drive.transport) parts.push(drive.transport)
  parts.push(drive.rotational ? "HDD" : "SSD")
  parts.push(size(drive.size))
  parts.push(drive.name)
  return parts.join(" · ")
}

// "16.8 GiB of 19.5 GiB · ext4 · nvme0n1p6"
function filesystemDetail(fs) {
  var parts = [size(fs.used) + " of " + size(fs.total)]
  if (fs.fstype) parts.push(fs.fstype)
  parts.push(fs.device)
  return parts.join(" · ")
}

// "nvme0n1p3 ntfs “Windows” 1.7 TiB, sdb1 ntfs 466 GiB"
function unmountedList(drive) {
  return drive.unmounted.map(function(part) {
    return part.device + " " + part.fstype
      + (part.label ? " \u201c" + part.label + "\u201d" : "") + " " + size(part.size)
  }).join(", ")
}

function swapList(drive) {
  return drive.swap.map(function(part) { return part.device + " " + size(part.size) }).join(", ")
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

if (typeof module !== "undefined") {
  module.exports = {
    sections: sections,
    cpuSample: cpuSample,
    cpuUsage: cpuUsage,
    memory: memory,
    loadAverage: loadAverage,
    temperatures: temperatures,
    size: size,
    driveTemperatures: driveTemperatures,
    drives: drives,
    driveSummary: driveSummary,
    filesystemDetail: filesystemDetail,
    unmountedList: unmountedList,
    swapList: swapList,
    uptime: uptime
  }
}

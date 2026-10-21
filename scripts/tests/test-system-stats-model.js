#!/usr/bin/env node
// Pure logic of the Quickshell System widget. Run: node scripts/tests/test-system-stats-model.js
"use strict"

const assert = require("node:assert/strict")
const path = require("node:path")
const Model = require(path.join(__dirname, "../../dot/.config/quickshell/leo-shell/SystemStatsModel.js"))

const GiB = 1073741824

function lsblk(devices) {
  return JSON.stringify({ blockdevices: devices })
}

function part(name, extra) {
  return Object.assign({ name: name, type: "part", size: 10 * GiB, fstype: "ext4", mountpoints: [null] }, extra)
}

const tests = {
  "probe output splits into sections"() {
    assert.deepEqual(Model.sections("a\n---\nb\n---\n{\"x\": \"---\"}\n---\nc", 3),
      ["a", "b", "{\"x\": \"---\"}\n---\nc"])
    assert.deepEqual(Model.sections("a\n---\n---\n{}", 3), ["a", "", "{}"])
    assert.deepEqual(Model.sections("", 3), ["", "", ""])
  },

  "hwmon temperatures cover cpu and gpu only"() {
    assert.deepEqual(Model.temperatures("nvme 47850\nk10temp 61875\namdgpu 47000\nacpitz 16800\n"),
      { cpu: 61.875, gpu: 47 })
    assert.deepEqual(Model.temperatures(""), { cpu: -1, gpu: -1 })
  },

  "sizes pick a readable unit"() {
    assert.equal(Model.size(100 * 1048576), "100 MiB")
    assert.equal(Model.size(19.5 * GiB), "19.5 GiB")
    assert.equal(Model.size(466 * GiB), "466 GiB")
    assert.equal(Model.size(2000398934016), "1.8 TiB")
  },

  "every drive lists its mounts, swap and unmounted partitions"() {
    const json = lsblk([
      { name: "sda", type: "disk", size: 500 * GiB, model: "Samsung SSD 850 EVO 500GB", tran: "sata",
        rota: false, rm: false, mountpoints: [null], children: [
          part("sda1", { mountpoints: ["/mnt/data"], fssize: 400 * GiB, fsused: 100 * GiB })
        ] },
      { name: "sdb", type: "disk", size: 500 * GiB, model: "Old", tran: "sata", rota: true, rm: false,
        mountpoints: [null], children: [part("sdb1", { fstype: "ntfs", label: "New Volume" })] },
      { name: "zram0", type: "disk", size: 4 * GiB, fstype: "swap", mountpoints: ["[SWAP]"] },
      { name: "nvme0n1", type: "disk", size: 2000 * GiB, model: "CT2000P5PSSD8", tran: "nvme",
        rota: false, rm: false, mountpoints: [null], children: [
          part("nvme0n1p1", { fstype: "vfat", size: 100 * 1048576 }),
          part("nvme0n1p2", { fstype: null }),
          part("nvme0n1p5", { mountpoints: ["/"], fssize: 20 * GiB, fsused: 15 * GiB }),
          part("nvme0n1p6", { fstype: "swap", mountpoints: ["[SWAP]"], size: 8 * GiB }),
          part("nvme0n1p7", { fstype: "btrfs", mountpoints: ["/home", "/var/log"], fssize: 100 * GiB, fsused: 50 * GiB })
        ] }
    ])
    const drives = Model.drives(json, "nvme0n1 47850\n")

    assert.deepEqual(drives.map(d => d.name), ["nvme0n1", "sda", "sdb"])
    const [nvme, sda, sdb] = drives
    assert.equal(nvme.temperature, 47.85)
    assert.equal(sda.temperature, -1)
    assert.deepEqual(nvme.filesystems.map(fs => fs.mounts), [["/"], ["/home", "/var/log"]])
    assert.equal(Model.filesystemDetail(nvme.filesystems[0]), "15.0 GiB of 20.0 GiB · ext4 · nvme0n1p5")
    assert.equal(Model.swapList(nvme), "nvme0n1p6 8.0 GiB")
    assert.equal(Model.unmountedList(nvme), "nvme0n1p1 vfat 100 MiB")
    assert.equal(Model.driveSummary(nvme), "NVMe · SSD · 2.0 TiB · nvme0n1")
    assert.equal(Model.driveSummary(sdb), "SATA · HDD · 500 GiB · sdb")
    assert.equal(sda.filesystems[0].mounts[0], "/mnt/data")
    assert.equal(Model.unmountedList(sdb), "sdb1 ntfs \u201cNew Volume\u201d 10.0 GiB")
  },

  "filesystems behind LUKS and LVM belong to the drive"() {
    const json = lsblk([
      { name: "nvme0n1", type: "disk", size: 512 * GiB, tran: "nvme", rm: "1", rota: "0", children: [
        part("nvme0n1p2", { fstype: "crypto_LUKS", children: [
          { name: "root", type: "crypt", size: 500 * GiB, fstype: "ext4", mountpoint: "/", fssize: 490 * GiB, fsused: 10 * GiB }
        ] })
      ] }
    ])
    const [drive] = Model.drives(json, "")
    assert.equal(drive.system, true)
    assert.equal(drive.removable, true)
    assert.deepEqual(drive.filesystems.map(fs => fs.device), ["root"])
    assert.deepEqual(drive.unmounted, [])
    assert.equal(Model.driveSummary(drive), "Removable · NVMe · SSD · 512 GiB · nvme0n1")
  },

  "bad lsblk output yields no drives"() {
    assert.deepEqual(Model.drives("", ""), [])
    assert.deepEqual(Model.drives("{oops", ""), [])
  }
}

let failed = 0
for (const [name, test] of Object.entries(tests)) {
  try {
    test()
  } catch (error) {
    failed++
    console.error(`FAIL: ${name}\n${error.message}`)
  }
}
if (failed) process.exit(1)
console.log(`PASS: ${Object.keys(tests).length} system stats model tests`)

#!/usr/bin/env node
// Pure logic of the Quickshell Garmin widget. Run: node scripts/tests/test-garmin-model.js
"use strict"

const assert = require("node:assert/strict")
const path = require("node:path")
const Model = require(path.join(__dirname, "../../dot/.config/quickshell/leo-shell/GarminModel.js"))

function run(events, kind) {
  return events.reduce(Model.applyJobEvent, Model.startJob(kind, 0))
}

const tests = {
  "an add job tracks progress across files"() {
    let job = run([
      { event: "start", total: 2 },
      { event: "file", index: 0, name: "a.mp3" },
      { event: "phase", index: 0, phase: "uploading" },
      { event: "progress", index: 0, sent: 50, total: 100 }
    ], "add")
    assert.equal(Model.jobFraction(job), 0.25)
    assert.equal(Model.jobPhaseText(job), "Uploading 50%")
    assert.equal(Model.jobTitle(job), "Adding")
    job = [
      { event: "done", index: 0 },
      { event: "file", index: 1, name: "b.mp3" },
      { event: "skipped", index: 1, name: "b.mp3", reason: "Already on the watch" },
      { event: "finished", done: 1, skipped: 1, failed: 0 }
    ].reduce(Model.applyJobEvent, job)
    assert.equal(Model.jobFraction(job), 1)
    assert.equal(Model.jobSummary(job), "1 added · 1 skipped")
    assert.deepEqual(job.problems, [{ name: "b.mp3", text: "Already on the watch", alert: false }])
  },

  "an edit job counts the download as the first half"() {
    const job = run([
      { event: "start", total: 1 },
      { event: "file", index: 0, name: "a.mp3" },
      { event: "phase", index: 0, phase: "downloading" },
      { event: "progress", index: 0, sent: 1, total: 2 }
    ], "edit")
    assert.equal(Model.jobFraction(job), 0.25)
    assert.equal(Model.jobPhaseText(job), "Downloading 50%")
    const uploading = [{ event: "phase", phase: "uploading" }, { event: "progress", sent: 1, total: 2 }]
      .reduce(Model.applyJobEvent, job)
    assert.equal(Model.jobFraction(uploading), 0.75)
    assert.equal(Model.jobTitle(uploading), "Updating")
  },

  "a failure before any file fails what is left"() {
    const job = run([
      { event: "start", total: 3 },
      { event: "failed", index: -1, name: "", error: "No Garmin watch is connected" }
    ], "edit")
    assert.equal(job.failed, 3)
    assert.equal(job.problems[0].alert, true)
    const done = Model.applyJobEvent(job, { event: "finished", done: 0, skipped: 0, failed: 3 })
    assert.equal(Model.jobSummary(done), "3 failed")
  },

  "probe output becomes review rows"() {
    const items = Model.reviewItems(JSON.stringify({ files: [
      { source: "/a.flac", name: "a.flac", ok: true, from: "FLAC", to: "MP3", size: 2097152,
        fields: { artist: "A", title: "T", album: "" } },
      { source: "/c.jpg", name: "c.jpg", ok: false, error: ".jpg is not supported", fields: {} }
    ] }))
    assert.equal(Model.reviewSubtitle(items[0]), "FLAC → MP3 · 2 MB")
    assert.equal(Model.reviewSubtitle(items[1]), ".jpg is not supported")
    assert.equal(Model.reviewCount(items), 1)
    assert.equal(Model.reviewItems("not json"), null)
  },

  "the add manifest skips unreadable files and trims fields"() {
    const items = [{ ok: true, source: "/a.mp3" }, { ok: false, source: "/c.jpg" }]
    const values = [{ artist: " A ", title: "T", album: "" }, { artist: "x", title: "x", album: "x" }]
    assert.deepEqual(Model.addManifest(items, values), [{ source: "/a.mp3", artist: "A", title: "T", album: "" }])
  },

  "retag manifests"() {
    const tracks = [{ path: "/Music/A/U/a.mp3" }, { path: "/Music/A/U/b.m4a" }, { path: "/Music/A/U/c.wma" }]
    assert.equal(Model.retaggableCount(tracks), 2)
    assert.deepEqual(Model.artistManifest(tracks, " B ", ""), [
      { path: "/Music/A/U/a.mp3", artist: "B" },
      { path: "/Music/A/U/b.m4a", artist: "B" }
    ])
    assert.equal(Model.artistManifest(tracks, "B", "LP")[0].album, "LP")
    assert.deepEqual(Model.trackManifest("/Music/A/U/a.mp3", { artist: "A", title: " T ", album: undefined }),
      [{ path: "/Music/A/U/a.mp3", artist: "A", title: "T", album: "" }])
  },

  "zenity output and storage"() {
    assert.deepEqual(Model.pickedFiles("/a b.mp3\n/c.flac\n"), ["/a b.mp3", "/c.flac"])
    assert.equal(Model.storage({}), null)
    assert.equal(Model.storage({ capacity: 100, free: 5 }).tone, "alert")
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
console.log(`PASS: ${Object.keys(tests).length} Garmin model tests`)

// node mods/setups/model.test.mjs
import assert from "node:assert/strict";
import { ago, blockers, family, groups, onlyHere, sanityLine, short, unpushed } from "./model.js";

assert.equal(short("ch03wxuboard310"), "uboard310");
assert.equal(family("ch03wxuboard310"), "UBOARD3");
assert.equal(family("ch03wxpevb12"), "PEVB");
assert.equal(family("ch03wxfpga01"), "FPGA");
assert.equal(family("ch03cwa69s5tb4"), "");

const repo = (name, branch, more = {}) => ({ name, branch, src: true, upstream: true, ahead: 0, changed: 0, untracked: 0, stashes: 0, local: 0, ...more });
const repos = [
  repo("top", "master"),
  repo("rom", "31178-sinegen", { ahead: 2, changed: 3 }),
  repo("apps", "31178-sinegen", { upstream: false, ahead: null }),
  repo("bt", "rel/1_5", { stashes: 2 }),
  repo("buildsystem", "to4/master", { local: 4, untracked: 1 }),
  repo("dsp", "4be09321", { src: false, upstream: false, local: 7 }),
];

assert.deepEqual(groups(repos), [
  { branch: "31178-sinegen", names: ["rom", "apps"], base: false },
  { branch: "master", names: ["top"], base: true },
  { branch: "rel/1_5", names: ["bt"], base: true },
  { branch: "to4/master", names: ["buildsystem"], base: true },
]);
// A detached source component (hash) is not "not pushed"; binary clones are left out.
assert.deepEqual(unpushed([...repos, repo("tx", "e08850a", { upstream: false })]), ["rom ↑2", "apps not pushed"]);

const report = { andromeda: { repos }, dotfiles: repo("dotfiles", "master", { stashes: 1 }) };
assert.equal(blockers(report), "rom 3");
assert.equal(blockers({ andromeda: null }), "");
assert.equal(onlyHere(report), "1 untracked file · 3 stashes · 11 local-only commits");
assert.equal(onlyHere({ andromeda: null, dotfiles: null }), "");

const now = 1_000_000_000_000; // ms
assert.equal(ago(now / 1000 - 30, now), "now");
assert.equal(ago(now / 1000 - 300, now), "5m");
assert.equal(ago(now / 1000 - 3 * 3600, now), "3h");
assert.equal(ago(now / 1000 - 2 * 86400, now), "2d");

const run = { name: "to4_app_ub3_reg", at: now / 1000 - 7200, done: 12, failed: ["Audio path"], step: "BLE" };
assert.equal(sanityLine({ ...run, state: "running" }, now), "to4_app_ub3_reg · BLE · 12 done, 1 failed");
assert.equal(sanityLine({ ...run, state: "done" }, now), "to4_app_ub3_reg · 2h ago · 1 failed");
assert.equal(sanityLine({ ...run, state: "done", failed: [] }, now), "to4_app_ub3_reg · 2h ago · all passed");
assert.equal(sanityLine({ ...run, state: "stopped" }, now), "to4_app_ub3_reg · 2h ago · stopped");

console.log("ok");

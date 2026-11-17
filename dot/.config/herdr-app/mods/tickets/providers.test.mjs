// node mods/tickets/providers.test.mjs
import assert from "node:assert/strict";
import { PROVIDERS, ago, columns, dropped, parseSources, size, valueOf } from "./providers.js";

const { redmine, github } = PROVIDERS;

// Redmine: the list and one issue, as redmine.py prints them.
const list = redmine.parseList(JSON.stringify({
  base: "https://rm/redmine",
  issues: [{ id: 7, subject: "Fix it", status: { name: "New" }, priority: { name: "High" }, project: { name: "rom" }, updated_on: "2026-11-01T10:00:00Z" }],
  closed: [{ id: 8, subject: "Done", status: { name: "Closed" }, updated_on: "2026-10-01T10:00:00Z" }],
  statuses: ["New", "In Progress"],
}), "Work");
assert.deepEqual(list.map((t) => [t.ref, t.closed]), [[7, false], [8, true]]);
assert.deepEqual(list.slice(0, 1), [{
  key: "Work:7", source: "Work", id: "#7", ref: 7, title: "Fix it", status: "New", closed: false, rank: 0, priority: "High", project: "rom",
  updated: "2026-11-01T10:00:00Z", url: "https://rm/redmine/issues/7",
}]);
assert.deepEqual(redmine.view(list[0], "S"), ["python3", "-c", "S", "view", "7"]);

const view = (issue, fields) => redmine.parseView(JSON.stringify({
  base: "https://rm/redmine", issue, fields, me: 5, related: { 9: { subject: "Other", status: "New" } },
}));
const issue = {
  id: 7, subject: "Fix it", description: "Body", status: { id: 1, name: "New" }, allowed_statuses: [{ id: 1, name: "New" }, { id: 3, name: "Resolved" }],
  project: { id: 54, name: "rom" }, tracker: { id: 1, name: "Bug" }, priority: { id: 2, name: "Normal" }, author: { name: "Ann" },
  assigned_to: { id: 5, name: "Bob" }, parent: { id: 3 }, start_date: "2026-11-01", done_ratio: 30, is_private: false,
  created_on: "2026-10-01T00:00:00Z",
  custom_fields: [{ id: 12, name: "PR", value: "a\nb" }, { id: 13, name: "Empty", value: "" }, { id: 14, name: "Multi", value: ["x", "y"], multiple: true }],
  children: [{ id: 8, subject: "Part" }],
  relations: [
    { id: 1, issue_id: 7, issue_to_id: 9, relation_type: "blocks" },
    { id: 2, issue_id: 5, issue_to_id: 7, relation_type: "copied_to" },
    { id: 3, issue_id: 7, issue_to_id: 4, relation_type: "precedes", delay: 2 },
  ],
  attachments: [{ id: 30, filename: "log.txt", filesize: 2048, author: { name: "Ann" }, created_on: "t", description: "the log" }],
  watchers: [{ id: 5, name: "Bob" }],
  journals: [{ user: { name: "Bob" }, created_on: "2026-11-02T00:00:00Z", notes: "Hi" }, { user: { name: "Bot" }, notes: "", details: [{}] }],
};
const detail = view(issue, null);
const entry = (attr) => detail.form.find((f) => f.attr === attr);
assert.equal(detail.scope, 54);
assert.equal(detail.description, "Body");
assert.deepEqual(detail.form.map((f) => f.attr), [
  "subject", "status_id", "project_id", "tracker_id", "priority_id", "assigned_to_id", "category_id", "fixed_version_id",
  "parent_issue_id", "start_date", "due_date", "estimated_hours", "done_ratio", "is_private", "cf:12", "cf:13", "cf:14",
]);
assert.deepEqual(entry("status_id"), {
  attr: "status_id", label: "Status", type: "select", value: 1, text: "New", place: "status",
  options: [{ id: 1, name: "New" }, { id: 3, name: "Resolved" }],
});
assert.deepEqual([entry("assigned_to_id").value, entry("assigned_to_id").text, entry("assigned_to_id").nullable], [5, "Bob", true]);
assert.deepEqual([entry("category_id").value, entry("category_id").text], ["", ""]);
assert.deepEqual([entry("parent_issue_id").value, entry("parent_issue_id").text], [3, "#3"]);
assert.deepEqual([entry("start_date").value, entry("due_date").value], ["2026-11-01", ""]);
assert.deepEqual([entry("done_ratio").value, entry("done_ratio").options.length], [30, 11]);
assert.deepEqual([entry("is_private").value, entry("is_private").text], [false, "No"]);
assert.deepEqual([entry("cf:12").type, entry("cf:12").value, entry("cf:14").type, entry("cf:14").value], ["long", "a\nb", "lines", "x\ny"]);
assert.deepEqual(detail.info, [["Author", "Ann"], ["Created", "2026-10-01T00:00:00Z"], ["Subtask", "#8 Part"]]);
// A relation reads from this issue's side: #5 copied to #7 is "Copied from #5" here.
assert.deepEqual(detail.relations, [
  { id: 1, label: "Blocks", to: 9, title: "Other", status: "New", url: "https://rm/redmine/issues/9" },
  { id: 2, label: "Copied from", to: 5, title: "", status: "", url: "https://rm/redmine/issues/5" },
  { id: 3, label: "Precedes (2 days)", to: 4, title: "", status: "", url: "https://rm/redmine/issues/4" },
]);
assert.deepEqual(detail.attachments, [{ id: 30, name: "log.txt", size: 2048, author: "Ann", at: "t", description: "the log", url: "https://rm/redmine/attachments/30" }]);
assert.deepEqual([detail.watchers, detail.me], [[{ id: 5, name: "Bob" }], 5]);
assert.deepEqual(detail.comments, [{ author: "Bob", at: "2026-11-02T00:00:00Z", body: "Hi" }]);
// The tracker's unused standard fields are left out; project, tracker and private always show.
assert.deepEqual(view(issue, ["assigned_to_id"]).form.map((f) => f.attr).slice(0, 6), ["subject", "status_id", "project_id", "tracker_id", "assigned_to_id", "is_private"]);

const update = (change) => redmine.update(list[0], change, "S").slice(3);
assert.deepEqual(redmine.update(list[0], { attr: "status_id", value: 3 }, "S"), ["python3", "-c", "S", "call", "PUT", "issues/7.json", '{"issue":{"status_id":3}}']);
assert.deepEqual(update({ attr: "assigned_to_id", value: "" }), ["call", "PUT", "issues/7.json", '{"issue":{"assigned_to_id":""}}']);
assert.deepEqual(update({ comment: "Done" }), ["call", "PUT", "issues/7.json", '{"issue":{"notes":"Done"}}']);
assert.deepEqual(update({ attr: "cf:12", value: "x" }), ["call", "PUT", "issues/7.json", '{"issue":{"custom_fields":[{"id":12,"value":"x"}]}}']);
assert.deepEqual(update({ attach: ["/a b.txt"], description: "d" }), ["attach", "7", '["/a b.txt"]', "d"]);
assert.deepEqual(update({ unattach: 30 }), ["call", "DELETE", "attachments/30.json"]);
assert.deepEqual(update({ relate: "blocks", to: 9 }), ["call", "POST", "issues/7/relations.json", '{"relation":{"issue_to_id":9,"relation_type":"blocks"}}']);
assert.deepEqual(update({ relate: "precedes", to: 9, delay: 2 }).at(-1), '{"relation":{"issue_to_id":9,"relation_type":"precedes","delay":2}}');
assert.deepEqual(update({ unrelate: 1 }), ["call", "DELETE", "relations/1.json"]);
assert.deepEqual(update({ watch: 5 }), ["call", "POST", "issues/7/watchers.json", '{"user_id":5}']);
assert.deepEqual(update({ unwatch: 5 }), ["call", "DELETE", "issues/7/watchers/5.json"]);
assert.deepEqual(redmine.download({ id: 30 }, "~/Downloads", "S"), ["python3", "-c", "S", "download", "30", "~/Downloads"]);
assert.deepEqual(redmine.options(list[0], detail, "category_id", "S"), ["python3", "-c", "S", "options", "54", "category_id"]);

// GitHub: gh's JSON, newest first.
const issues = github.parseList(JSON.stringify([
  { number: 1, title: "Old", repository: { name: "app", nameWithOwner: "me/app" }, state: "open", labels: [], updatedAt: "2026-01-01T00:00:00Z", url: "u1" },
  { number: 3, title: "Shut", repository: { name: "app", nameWithOwner: "me/app" }, state: "closed", labels: [], updatedAt: "2025-01-01T00:00:00Z", url: "u3" },
  { number: 2, title: "New", repository: { name: "app", nameWithOwner: "me/app" }, state: "open", labels: [{ name: "bug" }], updatedAt: "2026-02-01T00:00:00Z", url: "u2" },
]), "Home");
assert.deepEqual(issues.map((t) => [t.key, t.id, t.status, t.closed, t.project]), [["Home:me/app#2", "app#2", "Open", false, "bug"], ["Home:me/app#1", "app#1", "Open", false, ""], ["Home:me/app#3", "app#3", "Closed", true, ""]]);
assert.deepEqual(github.view(issues[0]).slice(0, 6), ["gh", "issue", "view", "2", "-R", "me/app"]);
const gh = github.parseView(JSON.stringify({ state: "OPEN", title: "New", body: "", author: { login: "me" }, assignees: [], labels: [], comments: [{ author: { login: "you" }, createdAt: "t", body: "ok" }] }));
assert.deepEqual(gh.form.map((f) => [f.attr, f.value, f.place]), [["title", "New", "title"], ["state", "open", "status"]]);
assert.deepEqual([gh.info, gh.description, gh.comments], [[["Author", "me"]], "", [{ author: "you", at: "t", body: "ok" }]]);
assert.equal(github.options(), null);
assert.deepEqual(github.update(issues[0], { attr: "state", value: "closed" }), ["gh", "issue", "close", "2", "-R", "me/app"]);
assert.deepEqual(github.update(issues[0], { attr: "state", value: "open" }), ["gh", "issue", "reopen", "2", "-R", "me/app"]);
assert.deepEqual(github.update(issues[0], { comment: "hi" }), ["gh", "issue", "comment", "2", "-R", "me/app", "--body", "hi"]);
assert.deepEqual(github.update(issues[0], { attr: "title", value: "T" }), ["gh", "issue", "edit", "2", "-R", "me/app", "--title", "T"]);
assert.deepEqual(github.update(issues[0], { attr: "description", value: "b" }), ["gh", "issue", "edit", "2", "-R", "me/app", "--body", "b"]);

// Typed values.
const e = (type, nullable = true) => ({ label: "F", type, nullable });
assert.deepEqual(valueOf(e("text", false), "  "), { error: "F cannot be empty" });
assert.deepEqual(valueOf(e("text"), " "), { value: "" });
assert.deepEqual(valueOf(e("text", false), " Title "), { value: "Title" });
assert.deepEqual(valueOf(e("date"), "2026-02-28"), { value: "2026-02-28" });
assert.ok(valueOf(e("date"), "2026-02-30").error);
assert.ok(valueOf(e("date"), "28.02.2026").error);
assert.deepEqual(valueOf(e("number"), "1,5"), { value: 1.5 });
assert.ok(valueOf(e("number"), "-1").error);
assert.deepEqual(valueOf(e("id"), "#123"), { value: 123 });
assert.ok(valueOf(e("id"), "12a").error);
assert.deepEqual(valueOf(e("lines"), "a\n\n b \n"), { value: ["a", "b"] });
assert.deepEqual(valueOf(e("lines"), ""), { value: [] });
assert.deepEqual(valueOf(e("long"), " x\ny "), { value: "x\ny" });

// Columns follow the tracker's order; a status it does not list goes last.
const card = (key, status, rank) => ({ key, status, rank });
assert.deepEqual(columns([card("a", "Resolved", 2), card("b", "New", 0), card("c", "Odd", -1), card("d", "New", 0)]), [
  { status: "New", tickets: [card("b", "New", 0), card("d", "New", 0)] },
  { status: "Resolved", tickets: [card("a", "Resolved", 2)] },
  { status: "Odd", tickets: [card("c", "Odd", -1)] },
]);
assert.deepEqual(columns([]), []);

assert.deepEqual([size(980), size(2048), size(4 * 1024 * 1024)], ["980 B", "2.0 KB", "4.0 MB"]);
assert.equal(dropped("/home/me/a.txt", null), "/home/me/a.txt");
assert.equal(dropped("C:\\Users\\me\\a b.txt", "1-wsl"), "/mnt/c/Users/me/a b.txt");
assert.equal(dropped("C:\\Users\\me\\a.txt", "board"), null);
assert.equal(dropped("/home/me/a.txt", "1-wsl"), null);

const now = Date.parse("2026-11-16T12:00:00Z");
assert.equal(ago("2026-11-16T11:55:00Z", now), "5m");
assert.equal(ago("2026-11-16T09:00:00Z", now), "3h");
assert.equal(ago("2026-11-14T12:00:00Z", now), "2d");
assert.equal(ago("2026-10-01T12:00:00Z", now), "7w");

assert.deepEqual(parseSources('[{"name":"Work","kind":"redmine","machine":"1-wsl"},{"name":"Home","kind":"github"}]'), {
  sources: [{ name: "Work", kind: "redmine", machine: "1-wsl" }, { name: "Home", kind: "github", machine: null }], error: "",
});
assert.match(parseSources('[{"name":"X","kind":"jira"}]').error, /unknown kind/);
assert.match(parseSources('[{"name":"X","kind":"github"},{"name":"X","kind":"github"}]').error, /differ/);
assert.match(parseSources("{").error, /sources.json/);
console.log("ok");

// One provider per tracker kind: the commands that list a source's tickets, show,
// change one and list what an attribute can be set to, run on the source's machine,
// and how their output becomes the shape the view draws. Adding a tracker means
// adding a provider here.
//
// Ticket: { key, source, id, ref, title, status, rank, priority, project, updated, url }
//   id is what the person reads ("#123", "repo#12"), ref what the commands need,
//   rank where its status comes in the tracker's order (the board's columns).
// Detail: { scope, form, info: [[name, text]], description, comments: [{ author, at, body }],
//   attachments?, relations?, watchers?, me? } (a tracker without one leaves it out)
//   attachments: [{ id, name, size, author, at, description, url }]
//   relations: [{ id, label, to, title, status, url }]; watchers: [{ id, name }]; me: my user id
//   scope: what option lists depend on (Redmine's project); form: the attributes
//   that can be changed, in order. One with place "status" or "title" is drawn in
//   the header instead of the form.
// Form entry: { attr, label, type, value, text, options?, nullable?, place? }
//   type: "select" (options inline, or listed by the provider's options command),
//   "text" (one line), "long" (several lines), "number", "date", "id" (a ticket number),
//   "lines" (one value per line).
//   value is what the attribute holds now (an option id, text), text what to show.
// A change: { attr, value } | { comment } | { attach: [paths], description } | { unattach: id }
//   | { relate: type, to, delay? } | { unrelate: id } | { watch: user } | { unwatch: user }.

const GH_LIST = "number,title,repository,state,labels,updatedAt,url";
const GH_VIEW = "state,title,body,author,createdAt,assignees,labels,milestone,comments";
const DONE = Array.from({ length: 11 }, (_, i) => ({ id: i * 10, name: `${i * 10} %` }));
const YES_NO = [{ id: true, name: "Yes" }, { id: false, name: "No" }];
// Redmine's standard fields, in its form's order; `standard` ones show only when the tracker uses them.
const REDMINE_FORM = [
  { attr: "project_id", label: "Project", type: "select", of: (i) => i.project },
  { attr: "tracker_id", label: "Tracker", type: "select", of: (i) => i.tracker },
  { attr: "priority_id", label: "Priority", type: "select", of: (i) => i.priority, standard: true },
  { attr: "assigned_to_id", label: "Assignee", type: "select", of: (i) => i.assigned_to, nullable: true, standard: true },
  { attr: "category_id", label: "Category", type: "select", of: (i) => i.category, nullable: true, standard: true },
  { attr: "fixed_version_id", label: "Target version", type: "select", of: (i) => i.fixed_version, nullable: true, standard: true },
  { attr: "parent_issue_id", label: "Parent task", type: "id", of: (i) => i.parent && { id: i.parent.id, name: `#${i.parent.id}` }, nullable: true, standard: true },
  { attr: "start_date", label: "Start date", type: "date", plain: "start_date", nullable: true, standard: true },
  { attr: "due_date", label: "Due date", type: "date", plain: "due_date", nullable: true, standard: true },
  { attr: "estimated_hours", label: "Estimated time", type: "number", plain: "estimated_hours", nullable: true, standard: true },
  { attr: "done_ratio", label: "% Done", type: "select", options: DONE, of: (i) => ({ id: i.done_ratio ?? 0, name: `${i.done_ratio ?? 0} %` }), standard: true },
  { attr: "is_private", label: "Private", type: "select", options: YES_NO, of: (i) => ({ id: !!i.is_private, name: i.is_private ? "Yes" : "No" }) },
];

// Redmine's relation types, as its form names them; `back` is how the other issue reads it.
export const RELATIONS = [
  { id: "relates", name: "Related to", back: "relates" },
  { id: "duplicates", name: "Is duplicate of", back: "duplicated" },
  { id: "duplicated", name: "Has duplicate", back: "duplicates" },
  { id: "blocks", name: "Blocks", back: "blocked" },
  { id: "blocked", name: "Blocked by", back: "blocks" },
  { id: "precedes", name: "Precedes", back: "follows" },
  { id: "follows", name: "Follows", back: "precedes" },
  { id: "copied_to", name: "Copied to", back: "copied_from" },
  { id: "copied_from", name: "Copied from", back: "copied_to" },
];

export const PROVIDERS = {
  // redmine.py is sent to the machine (python3 -c), so it needs no checkout there.
  redmine: {
    script: "redmine.py",
    list: (script) => ["python3", "-c", script, "list"],
    view: (ticket, script) => ["python3", "-c", script, "view", String(ticket.ref)],
    options: (ticket, detail, attr, script) => ["python3", "-c", script, "options", String(detail.scope), attr],
    download: (attachment, folder, script) => ["python3", "-c", script, "download", String(attachment.id), folder],
    update(ticket, change, script) {
      const call = (method, path, body) => ["python3", "-c", script, "call", method, path, ...(body ? [JSON.stringify(body)] : [])];
      const issue = `issues/${ticket.ref}`;
      if ("attach" in change) return ["python3", "-c", script, "attach", String(ticket.ref), JSON.stringify(change.attach), change.description || ""];
      if ("unattach" in change) return call("DELETE", `attachments/${change.unattach}.json`);
      if ("relate" in change) {
        const relation = { issue_to_id: change.to, relation_type: change.relate, ...(change.delay !== undefined && { delay: change.delay }) };
        return call("POST", `${issue}/relations.json`, { relation });
      }
      if ("unrelate" in change) return call("DELETE", `relations/${change.unrelate}.json`);
      if ("watch" in change) return call("POST", `${issue}/watchers.json`, { user_id: change.watch });
      if ("unwatch" in change) return call("DELETE", `${issue}/watchers/${change.unwatch}.json`);
      if ("comment" in change) return call("PUT", `${issue}.json`, { issue: { notes: change.comment } });
      if (change.attr.startsWith("cf:")) return call("PUT", `${issue}.json`, { issue: { custom_fields: [{ id: Number(change.attr.slice(3)), value: change.value }] } });
      return call("PUT", `${issue}.json`, { issue: { [change.attr]: change.value } });
    },
    parseList(stdout, source) {
      const { base, issues, statuses = [] } = JSON.parse(stdout);
      return issues.map((i) => ({
        key: `${source}:${i.id}`,
        source,
        id: `#${i.id}`,
        ref: i.id,
        title: i.subject,
        status: i.status?.name || "",
        rank: statuses.indexOf(i.status?.name),
        priority: i.priority?.name || "",
        project: i.project?.name || "",
        updated: i.updated_on,
        url: `${base}/issues/${i.id}`,
      }));
    },
    parseView(stdout) {
      const { base, issue: i, fields: enabled, related = {}, me } = JSON.parse(stdout);
      const form = [
        { attr: "subject", label: "Subject", type: "text", value: i.subject, text: i.subject, place: "title" },
        {
          attr: "status_id", label: "Status", type: "select", value: i.status?.id, text: i.status?.name || "", place: "status",
          options: (i.allowed_statuses || []).map((st) => ({ id: st.id, name: st.name })),
        },
      ];
      for (const f of REDMINE_FORM) {
        if (f.standard && enabled && !enabled.includes(f.attr)) continue;
        const now = f.of ? f.of(i) : i[f.plain] != null && { id: i[f.plain], name: String(i[f.plain]) };
        form.push({
          attr: f.attr, label: f.label, type: f.type, nullable: !!f.nullable, ...(f.options && { options: f.options }),
          value: now ? now.id : "", text: now ? now.name : "",
        });
      }
      // Without the field definitions (admin only), a custom field is edited as its text.
      for (const f of i.custom_fields || []) {
        const lines = Array.isArray(f.value);
        const text = lines ? f.value.join("\n") : f.value ?? "";
        form.push({ attr: `cf:${f.id}`, label: f.name, type: lines ? "lines" : "long", nullable: true, value: text, text });
      }
      const info = [
        ["Author", i.author?.name],
        ["Created", i.created_on],
        ["Closed", i.closed_on],
        ...(i.children || []).map((c) => ["Subtask", `#${c.id} ${c.subject}`]),
      ];
      const relations = (i.relations || []).map((r) => {
        const mine = r.issue_id === i.id;
        const to = mine ? r.issue_to_id : r.issue_id;
        const type = RELATIONS.find((t) => t.id === r.relation_type);
        const as = mine ? type : RELATIONS.find((t) => t.id === type?.back);
        const delay = r.delay ? ` (${r.delay} day${Math.abs(r.delay) === 1 ? "" : "s"})` : "";
        return {
          id: r.id, label: (as?.name || r.relation_type) + delay, to,
          title: related[to]?.subject || "", status: related[to]?.status || "", url: `${base}/issues/${to}`,
        };
      });
      return {
        scope: i.project?.id,
        form,
        info: info.filter(([, text]) => text),
        description: i.description || "",
        comments: (i.journals || []).filter((j) => j.notes).map((j) => ({ author: j.user?.name || "", at: j.created_on, body: j.notes })),
        attachments: (i.attachments || []).map((a) => ({
          id: a.id, name: a.filename, size: a.filesize, author: a.author?.name || "", at: a.created_on, description: a.description || "",
          url: `${base}/attachments/${a.id}`,
        })),
        relations,
        watchers: (i.watchers || []).map((w) => ({ id: w.id, name: w.name })),
        me,
      };
    },
  },

  // gh keeps its own login, so nothing secret goes through the mod.
  github: {
    list: () => ["gh", "search", "issues", "--assignee=@me", "--state=open", "--limit=100", "--json", GH_LIST],
    view: (ticket) => ["gh", "issue", "view", String(ticket.ref.number), "-R", ticket.ref.repo, "--json", GH_VIEW],
    options: () => null,
    update(ticket, change) {
      const [number, repo] = [String(ticket.ref.number), ticket.ref.repo];
      if ("comment" in change) return ["gh", "issue", "comment", number, "-R", repo, "--body", change.comment];
      if (change.attr === "state") return ["gh", "issue", change.value === "closed" ? "close" : "reopen", number, "-R", repo];
      if (change.attr === "title") return ["gh", "issue", "edit", number, "-R", repo, "--title", change.value];
      if (change.attr === "description") return ["gh", "issue", "edit", number, "-R", repo, "--body", change.value];
      throw new Error(`GitHub: ${change.attr} cannot be changed here`);
    },
    parseList(stdout, source) {
      return JSON.parse(stdout)
        .map((i) => ({
          key: `${source}:${i.repository.nameWithOwner}#${i.number}`,
          source,
          id: `${i.repository.name}#${i.number}`,
          ref: { repo: i.repository.nameWithOwner, number: i.number },
          title: i.title,
          status: i.state === "open" ? "Open" : i.state,
          rank: 0,
          priority: "",
          project: i.labels.map((l) => l.name).join(", "),
          updated: i.updatedAt,
          url: i.url,
        }))
        .sort((a, b) => b.updated.localeCompare(a.updated));
    },
    parseView(stdout) {
      const i = JSON.parse(stdout);
      const open = i.state === "OPEN";
      const info = [
        ["Author", i.author?.login],
        ["Assignees", (i.assignees || []).map((a) => a.login).join(", ")],
        ["Labels", (i.labels || []).map((l) => l.name).join(", ")],
        ["Milestone", i.milestone?.title],
      ];
      return {
        scope: "",
        form: [
          { attr: "title", label: "Title", type: "text", value: i.title, text: i.title, place: "title" },
          {
            attr: "state", label: "Status", type: "select", value: open ? "open" : "closed", text: open ? "Open" : "Closed", place: "status",
            options: [{ id: "open", name: "Open" }, { id: "closed", name: "Closed" }],
          },
        ],
        info: info.filter(([, text]) => text),
        description: i.body || "",
        comments: (i.comments || []).map((c) => ({ author: c.author?.login || "", at: c.createdAt, body: c.body })),
      };
    },
  },
};

/** What typed text sets a form entry to: { value } or { error }. */
export function valueOf(entry, text) {
  const typed = text.trim();
  if (!typed) {
    if (entry.type === "lines") return { value: [] };
    return entry.nullable ? { value: "" } : { error: `${entry.label} cannot be empty` };
  }
  if (entry.type === "date") {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(typed) && new Date(`${typed}T00:00:00Z`);
    return day && day.toISOString().startsWith(typed) ? { value: typed } : { error: "A date is YYYY-MM-DD" };
  }
  if (entry.type === "number") {
    const n = Number(typed.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? { value: n } : { error: `${entry.label} is a number of hours` };
  }
  if (entry.type === "id") return /^#?\d+$/.test(typed) ? { value: Number(typed.replace("#", "")) } : { error: "A ticket number, like 1234" };
  if (entry.type === "lines") return { value: typed.split("\n").map((l) => l.trim()).filter(Boolean) };
  return { value: typed };
}

/** The board's columns: the statuses the tickets are in, in the tracker's order. */
export function columns(tickets) {
  const rank = new Map();
  for (const x of tickets) if (!rank.has(x.status)) rank.set(x.status, x.rank < 0 ? Infinity : x.rank);
  return [...rank.keys()].sort((a, b) => rank.get(a) - rank.get(b))
    .map((status) => ({ status, tickets: tickets.filter((x) => x.status === status) }));
}

/** "980 B", "31.2 KB", "4.0 MB". */
export function size(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * A file dropped on this computer, as a source on `machine` reads it: the same path
 * here, and a Windows drive under WSL's /mnt. Null when that machine cannot see it.
 */
// shortcut: only WSL reaches this computer's files; copy the file over for other machines when one needs it.
export function dropped(path, machine) {
  if (!machine) return path;
  const drive = /^([A-Za-z]):[\\/](.*)$/.exec(path);
  if (!drive || !/wsl/i.test(machine)) return null;
  return `/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, "/")}`;
}

/** "5m", "3h", "2d", "4w" since `iso`. */
export function ago(iso, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  if (minutes < 60 * 24 * 14) return `${Math.round(minutes / 60 / 24)}d`;
  return `${Math.round(minutes / 60 / 24 / 7)}w`;
}

/** The sources from sources.json, or an error saying what is wrong. */
export function parseSources(text) {
  let sources;
  try {
    sources = JSON.parse(text);
  } catch (error) {
    return { sources: [], error: `sources.json: ${error.message}` };
  }
  if (!Array.isArray(sources)) return { sources: [], error: "sources.json: expected a list" };
  for (const s of sources) {
    if (!s || typeof s.name !== "string" || !s.name) return { sources: [], error: "sources.json: every source needs a name" };
    if (!PROVIDERS[s.kind]) return { sources: [], error: `sources.json: ${s.name}: unknown kind ${JSON.stringify(s.kind)}` };
  }
  if (new Set(sources.map((s) => s.name)).size !== sources.length) return { sources: [], error: "sources.json: names must differ" };
  return { sources: sources.map((s) => ({ name: s.name, kind: s.kind, machine: s.machine || null })), error: "" };
}

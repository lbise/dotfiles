// Totals over the collector's rows (collect.py), for the ranges, filters,
// grouping and chart the view offers.

const FIGURES = ["messages", "input", "output", "cacheRead", "cacheWrite", "reasoning", "cost"];

export const RANGES = [
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["month", "This month"],
  ["all", "All time"],
];

export const GROUPS = [
  ["model", "Model"],
  ["provider", "Provider"],
  ["machine", "Machine"],
  ["project", "Project"],
];

// What a provider's cost means. Subscriptions cost nothing more (pi's figure is
// what the tokens would cost on the API). Copilot bills AI credits on top of its
// seat, at 1 credit = $0.01 of pi's cost (as the usage extension measured).
// Anything else is metered: pi's cost is the bill.
const BILLING = { "openai-codex": "subscription", anthropic: "subscription", "github-copilot": "credits" };
export const CREDIT_USD = 0.01;
export const billing = (provider) => BILLING[provider] || "metered";

/** The chart's series: the biggest groups by name, the rest as one. */
export const SERIES = 6;
export const OTHER = "Other";

/** Collector rows of one machine as records. */
export function toRecords(machine, rows) {
  return rows.map(([day, provider, model, project, ...figures]) => ({
    machine, day, provider, model, project,
    ...Object.fromEntries(FIGURES.map((name, i) => [name, figures[i] || 0])),
  }));
}

function dayString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDay(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** The first day ("YYYY-MM-DD", local) a range covers; "" for all time. */
export function since(range, now = new Date()) {
  if (range === "month") return dayString(new Date(now.getFullYear(), now.getMonth(), 1));
  const days = { "7d": 7, "30d": 30 }[range];
  return days ? dayString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1)) : "";
}

/** Tokens through the model: what it read (fresh and cached), what it cached, what it wrote. */
export const tokens = (r) => r.input + r.cacheRead + r.cacheWrite + r.output;

function zero() {
  return { ...Object.fromEntries(FIGURES.map((name) => [name, 0])), billed: 0, subscription: 0, credits: 0 };
}

function add(into, r) {
  for (const name of FIGURES) into[name] += r[name];
  const kind = billing(r.provider);
  if (kind === "subscription") into.subscription += r.cost;
  else into.billed += r.cost;
  if (kind === "credits") into.credits += r.cost / CREDIT_USD;
}

/** A record's key and words for a grouping. */
export function groupOf(r, group) {
  if (group === "model") return { key: `${r.provider}\u0000${r.model}`, name: r.model, note: r.provider };
  return { key: r[group], name: r[group], note: "" };
}

/** The other dimension a group opens into: models per machine, machines otherwise. */
export const breakdownOf = (group) => (group === "machine" ? "model" : "machine");

function grouped(records, group, sub) {
  const groups = new Map();
  for (const r of records) {
    const { key, name, note } = groupOf(r, group);
    if (!groups.has(key)) groups.set(key, { key, name, note, ...zero(), parts: new Map() });
    const g = groups.get(key);
    add(g, r);
    if (!sub) continue;
    const part = groupOf(r, sub);
    if (!g.parts.has(part.key)) g.parts.set(part.key, { ...part, ...zero() });
    add(g.parts.get(part.key), r);
  }
  const byCost = (a, b) => b.cost - a.cost || tokens(b) - tokens(a);
  return [...groups.values()]
    .map((g) => ({ ...g, parts: [...g.parts.values()].sort(byCost) }))
    .sort(byCost);
}

/** Days, or weeks (from Monday) when a range spans more than ~3 months. */
function bucketing(first, last) {
  const weekly = (parseDay(last) - parseDay(first)) / 86400000 > 92;
  const keyOf = (day) => {
    if (!weekly) return day;
    const d = parseDay(day);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return dayString(d);
  };
  const keys = [];
  for (let d = parseDay(keyOf(first)); dayString(d) <= last; d.setDate(d.getDate() + (weekly ? 7 : 1))) keys.push(dayString(d));
  return { weekly, keys, keyOf };
}

/**
 * @param {object[]} records from toRecords, every machine
 * @param {{from: string, off: Set<string>, group: string, metric: "cost" | "tokens", bucket?: string, today?: string}} view
 *   `off` holds "p:<provider>" and "m:<machine>" left out; `bucket` narrows totals and table to one bar.
 */
export function summarize(records, { from, off, group, metric, bucket = "", today = dayString(new Date()) }) {
  const inRange = records.filter((r) => r.day !== "?" && r.day >= from && r.day <= today);
  // Every provider and machine in range stays listed, with what it would add, so it can be picked again.
  const chips = (prefix, field, other) => {
    const sums = new Map();
    for (const r of inRange) {
      if (!sums.has(r[field])) sums.set(r[field], zero());
      if (!off.has(`${other}:${other === "m" ? r.machine : r.provider}`)) add(sums.get(r[field]), r);
    }
    return [...sums].map(([name, sum]) => ({ name, key: `${prefix}:${name}`, ...sum })).sort((a, b) => b.cost - a.cost);
  };
  const picked = inRange.filter((r) => !off.has(`p:${r.provider}`) && !off.has(`m:${r.machine}`));

  const value = (r) => (metric === "tokens" ? tokens(r) : r.cost);
  const first = from || inRange.reduce((min, r) => (r.day < min ? r.day : min), today);
  const { weekly, keys, keyOf } = bucketing(first, today);
  const top = grouped(picked, group, null).sort((a, b) => value(b) - value(a)).slice(0, SERIES).map((g) => g.key);
  const bars = new Map(keys.map((key) => [key, { key, total: 0, parts: {} }]));
  for (const r of picked) {
    const bar = bars.get(keyOf(r.day));
    if (!bar) continue;
    const { key } = groupOf(r, group);
    const series = top.includes(key) ? key : OTHER;
    bar.total += value(r);
    bar.parts[series] = (bar.parts[series] || 0) + value(r);
  }
  const series = [...top];
  if ([...bars.values()].some((b) => b.parts[OTHER])) series.push(OTHER);

  const shown = bucket ? picked.filter((r) => keyOf(r.day) === bucket) : picked;
  const total = zero();
  for (const r of shown) add(total, r);
  return {
    total,
    groups: grouped(shown, group, breakdownOf(group)),
    providers: chips("p", "provider", "m"),
    machines: chips("m", "machine", "p"),
    chart: { weekly, bars: [...bars.values()], series },
    span: { first, last: today },
  };
}

function short(value) {
  return (value < 9.95 ? value.toFixed(1) : String(Math.round(value))).replace(/\.0$/, "");
}

/** 950, 1.5k, 113k, 1.2M, 3.4B. */
export function formatTokens(count) {
  if (count < 1000) return String(Math.round(count));
  if (count < 999500) return `${short(count / 1e3)}k`;
  if (count < 999500000) return `${short(count / 1e6)}M`;
  return `${short(count / 1e9)}B`;
}

/** $0.0042, $1.42, $1,234. */
export function formatCost(usd) {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1000) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd).toLocaleString("en-US")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 15 – Nov 13", the days a range covers. */
export function formatSpan({ first, last }) {
  const day = (key) => formatBucket(key, false);
  const year = (key) => key.slice(0, 4);
  return year(first) === year(last) ? `${day(first)} – ${day(last)}` : `${day(first)} ${year(first)} – ${day(last)} ${year(last)}`;
}

/** When a limit resets: "in 2h 14m" within two days, else "Dec 1". */
export function formatReset(at, now = Date.now()) {
  const minutes = Math.max(0, Math.round((at - now) / 60000));
  if (minutes < 60) return `in ${minutes}m`;
  if (minutes < 48 * 60) return `in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  const d = new Date(at);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Nov 12", or "Week of Nov 10". */
export function formatBucket(key, weekly) {
  const d = parseDay(key);
  const day = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return weekly ? `Week of ${day}` : day;
}

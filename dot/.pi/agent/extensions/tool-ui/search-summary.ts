type SearchDetails = {
  matchLimitReached?: unknown;
  resultLimitReached?: unknown;
  lineLimitReached?: unknown;
  truncation?: { truncated?: unknown };
  linesTruncated?: unknown;
};

export type SearchSummaryInput = {
  text: string;
  details?: unknown;
  isError?: boolean;
};

function compact(text: string, maxLength = 180): string {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function lines(text: string): string[] {
  return text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
}

function details(value: unknown): SearchDetails {
  return value && typeof value === "object" ? value as SearchDetails : {};
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function resultNotes(value: unknown, output: string, kind: "matches" | "files"): string[] {
  const meta = details(value);
  const notes: string[] = [];
  const limit = kind === "matches"
    ? positiveNumber(meta.matchLimitReached)
    : positiveNumber(meta.resultLimitReached) ?? positiveNumber(meta.lineLimitReached);
  const singular = kind === "matches" ? "match" : "result";
  const plural = kind === "matches" ? "matches" : "results";
  if (limit) notes.push(`limited to ${countLabel(limit, singular, plural)}`);

  const more = output.match(/^\[\+(\d+) more\]$/m)?.[1];
  if (more) notes.push(`${countLabel(Number(more), "more result")} not shown`);

  if (
    meta.truncation?.truncated === true
    || /\[(?:RTK output truncated by Pi|\d+(?:\.\d+)?(?:KB|MB) limit reached)/.test(output)
  ) {
    notes.push("output truncated");
  }
  if (meta.linesTruncated === true) notes.push("some lines shortened");
  return notes;
}

function withNotes(summary: string, notes: string[]): string {
  return `↳ ${[summary, ...notes].join(" · ")}`;
}

function errorSummary(text: string): string {
  const message = compact(text) || "unknown error";
  return `↳ ${message.toLowerCase().startsWith("error:") ? message : `error: ${message}`}`;
}

/** Summarize Pi flat grep output and RTK's grouped grep output without showing matches. */
export function summarizeGrepResult(input: SearchSummaryInput): string {
  if (input.isError) return errorSummary(input.text);

  const output = input.text.trim();
  if (/^(?:no matches found|0 matches\b)/i.test(output)) return "↳ no matches";

  const grouped = output.match(/^(\d+) matches? in (\d+) files?:/im);
  const notes = resultNotes(input.details, output, "matches");
  if (grouped) {
    return withNotes(
      `${countLabel(Number(grouped[1]), "match", "matches")} in ${countLabel(Number(grouped[2]), "file")}`,
      notes,
    );
  }

  const matches = lines(output)
    .map((line) => line.match(/^(.+?):(\d+): /))
    .filter((match): match is RegExpMatchArray => Boolean(match));
  if (matches.length > 0) {
    const files = new Set(matches.map((match) => match[1]));
    return withNotes(
      `${countLabel(matches.length, "match", "matches")} in ${countLabel(files.size, "file")}`,
      notes,
    );
  }

  return withNotes(output ? "search completed, count unavailable" : "no matches", notes);
}

/** Summarize Pi flat find output and RTK's compact-tree output without showing paths. */
export function summarizeFindResult(input: SearchSummaryInput): string {
  if (input.isError) return errorSummary(input.text);

  const output = input.text.trim();
  if (/^(?:no files found matching pattern|0 for\b)/i.test(output)) return "↳ no files found";

  const tree = output.match(/^(\d+)\s*F(?:\s+(\d+)\s*D)?\s*:?\s*$/im)
    ?? output.match(/^(\d+)\s+files?(?:\s*(?:,|in)\s*(\d+)\s+(?:directory|directories|dirs?))?\s*:?\s*$/im);
  const notes = resultNotes(input.details, output, "files");
  if (tree) {
    const files = countLabel(Number(tree[1]), "file");
    const directories = tree[2] ? ` in ${countLabel(Number(tree[2]), "directory", "directories")}` : "";
    return withNotes(`${files}${directories}`, notes);
  }

  const paths = lines(output).filter((line) => line.trim() && !/^\[.*\]$/.test(line.trim()));
  if (paths.length > 0 && paths.every((line) => /^(?:\.?\.?\/|\S+$)/.test(line.trim()))) {
    return withNotes(countLabel(paths.length, "file"), notes);
  }

  return withNotes(output ? "search completed, count unavailable" : "no files found", notes);
}

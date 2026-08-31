import { spawn } from "node:child_process";

import type { EditToolDetails } from "@earendil-works/pi-coding-agent";

const DELTA_TIMEOUT_MS = 10_000;
const MAX_DELTA_OUTPUT_BYTES = 2 * 1024 * 1024;

export type DeltaEditDetails = EditToolDetails & {
  deltaOutput?: string;
  deltaError?: string;
};

export type DeltaRunResult = {
  output?: string;
  error?: string;
};

export type DiffStats = {
  additions: number;
  removals: number;
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

export function diffStats(patch: string): DiffStats {
  let additions = 0;
  let removals = 0;
  let inHunk = false;

  for (const line of patch.replaceAll("\r\n", "\n").split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) removals += 1;
  }

  return { additions, removals };
}

/** Remove delta's redundant file title and decorative rule. */
export function cleanDeltaOutput(output: string): string {
  const lines = output.replaceAll("\r\n", "\n").split("\n").filter((line) => {
    const visible = stripAnsi(line).trim();
    const fileTitle = visible.startsWith("Δ ") && visible.includes(" ⟶ ");
    return !fileTitle && !/^─{3,}$/.test(visible);
  });
  while (lines.length > 0 && stripAnsi(lines[0] ?? "").trim() === "") lines.shift();
  while (lines.length > 0 && stripAnsi(lines.at(-1) ?? "").trim() === "") lines.pop();
  return lines.join("\n");
}

/** Run delta as a non-interactive diff filter. Failure only affects presentation. */
export function runDelta(
  patch: string,
  options: { signal?: AbortSignal; cwd?: string; executable?: string } = {},
): Promise<DeltaRunResult> {
  return new Promise((resolve) => {
    const child = spawn(
      options.executable ?? "delta",
      ["--paging=never", "--width=variable", "--keep-plus-minus-markers"],
      {
        cwd: options.cwd,
        env: {
          ...process.env,
          DELTA_PAGER: "cat",
          GIT_PAGER: "cat",
          PAGER: "cat",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let settled = false;
    let outputTooLarge = false;

    const finish = (result: DeltaRunResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      resolve(result);
    };

    const abort = (): void => {
      child.kill();
      finish({ error: "delta rendering was cancelled" });
    };

    const timeout = setTimeout(() => {
      child.kill();
      finish({ error: `delta rendering timed out after ${DELTA_TIMEOUT_MS}ms` });
    }, DELTA_TIMEOUT_MS);
    timeout.unref();

    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) {
      abort();
      return;
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= MAX_DELTA_OUTPUT_BYTES) {
        stdout.push(chunk);
      } else if (!outputTooLarge) {
        outputTooLarge = true;
        child.kill();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.stdin.on("error", () => {
      // A spawn failure or early delta exit can close stdin before end() finishes.
    });
    child.on("error", (error) => finish({ error: errorText(error) }));
    child.on("close", (code, signal) => {
      if (outputTooLarge) {
        finish({ error: `delta output exceeded ${MAX_DELTA_OUTPUT_BYTES} bytes` });
        return;
      }

      const output = cleanDeltaOutput(Buffer.concat(stdout).toString("utf8"));
      const diagnostic = Buffer.concat(stderr).toString("utf8").trim();
      if (code === 0 && output) {
        finish({ output });
        return;
      }

      const status = signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`;
      finish({ error: diagnostic || `delta produced no output (${status})` });
    });

    child.stdin.end(patch);
  });
}

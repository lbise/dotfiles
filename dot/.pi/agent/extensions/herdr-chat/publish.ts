import { renameSync, writeFileSync } from "node:fs";

/** Writes JSON through a temp file and a rename, so a reader never sees half a file. */
export function writeJsonAtomic(file: string, value: unknown) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  renameSync(tmp, file);
}

/**
 * Publishes build() to `file`: right away when nothing was written lately, then at most once per
 * `intervalMs`. build() returns the state with `updated: 0`; nothing is written while the rest is
 * unchanged, and `updated` is stamped on each write.
 */
export function createPublisher(
  file: string,
  build: () => { updated: number },
  onError: (err: unknown) => void,
  intervalMs = 150
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastWrite = 0;
  let lastBody = "";

  function flush() {
    timer = undefined;
    try {
      const state = build();
      const body = JSON.stringify(state);
      if (body === lastBody) return;
      state.updated = Date.now();
      writeJsonAtomic(file, state);
      lastBody = body;
      lastWrite = state.updated;
    } catch (err) {
      onError(err);
    }
  }

  return {
    schedule() {
      if (timer) return;
      // Always a timer, also when no wait is due: the caller's event finishes before build() runs.
      timer = setTimeout(flush, Math.max(0, lastWrite + intervalMs - Date.now()));
      timer.unref?.();
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}

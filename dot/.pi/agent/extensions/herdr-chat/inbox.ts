import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

export const MAX_AGE_MS = 60 * 1000;

export type Command = { type: string; [field: string]: unknown };

/**
 * Takes every command file out of `dir`: deletes each one and returns the parsed commands in name
 * order. Files older than MAX_AGE_MS are deleted unread. Age is the file's mtime, so the clock of
 * the machine that named the file does not matter. Names that do not end in ".json" (the writer's
 * temp files) are left alone.
 */
export async function takeInbox(dir: string, now = Date.now()): Promise<{ commands: Command[]; errors: string[] }> {
  const commands: Command[] = [];
  const errors: string[] = [];
  const names = (await readdir(dir)).filter((name) => name.endsWith(".json") && !name.startsWith(".")).sort();

  for (const name of names) {
    const file = join(dir, name);
    try {
      const { mtimeMs } = await stat(file);
      const raw = await readFile(file, "utf8");
      // Delete before use: a file that cannot be deleted must not run again on every scan.
      await unlink(file);
      if (now - mtimeMs > MAX_AGE_MS) continue;
      const command = JSON.parse(raw);
      if (!command || typeof command.type !== "string") throw new Error("not a command");
      commands.push(command);
    } catch (err: any) {
      errors.push(`inbox ${name}: ${err?.message ?? err}`);
    }
  }
  return { commands, errors };
}

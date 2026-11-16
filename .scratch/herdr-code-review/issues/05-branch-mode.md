# Branch mode: review against a base

Status: done
Blocked by: 03

Spec: ../spec.md

- A Changes | Branch switch. Branch diffs `merge-base(base, HEAD)` against the worktree, untracked files included.
- Default base: `origin/HEAD`, else `main`/`master`; a small picker; kept per repo.
- Commit box in Changes mode only.

# Line comments sent to the tab's agent

Status: done
Blocked by: 04, 06

Spec: ../spec.md

- Click or shift-click to select lines (either side), then `c` or a button to write a comment. Drafts are listed and can be edited or deleted. They are kept in `shared`.
- Send to agent: one message through `hc send` (no Enter) to the active tab's agent; refused when the tab has none.
- First check how Pi takes newlines from `hc send` (risk in the spec).

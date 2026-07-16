# Skill categories

Each file in this directory defines one installable category for `scripts/ai-install-skills`.

- File name = category name, e.g. `web`
- File contents = one skill directory name from `../skills-catalog/` per line
- Blank lines and `#` comments are ignored

Example:

```text
# dot/.agents/skills-categories/web
frontend-design
```

Install a category into the current project's `.agents/skills` directory:

```bash
ai-install-skills web
```

Or target a specific project directory:

```bash
ai-install-skills web ~/gitrepo/my-project
```

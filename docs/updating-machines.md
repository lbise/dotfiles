# Updating machines

The installer and updater have separate jobs. Use the complete installer on a
new machine. Use the cheaper update commands for routine work.

## Commands

The repository's `scripts` directory is linked to `~/.scripts`, which is on the
shell `PATH` through `dot/.exports`.

```bash
# Pull with --ff-only and apply configuration hooks once for the new commit.
dotfiles sync

# Check the default version-aware user applications for updates.
dotfiles apps

# Check only selected applications.
dotfiles apps herdr fzf

# Pull, apply configuration, then check user applications.
dotfiles update

# Upgrade system packages. This is the only routine command that uses sudo.
dotfiles system

# Run the complete installer on a new machine.
dotfiles bootstrap
```

`dotfiles sync` refuses to pull when the repository has local changes. Commit,
stash, or remove those changes first. It also uses `git pull --ff-only`, so it
will not create an unexpected merge commit.

The default `apps` set is delta, eza, fd, fzf, herdr, Neovim, ripgrep, and tmux.
OpenCode and zsh are excluded because their installers can run remote install
scripts or change the login shell. Run either explicitly when wanted:

```bash
dotfiles apps opencode
dotfiles apps zsh
```

On Arch, package-owned applications such as fzf are skipped by `dotfiles apps`.
Use `dotfiles system` to update them through yay and pacman. On Ubuntu,
`dotfiles system` runs `apt-get update`, upgrades installed packages, and then
installs any packages newly declared by the repository.

## Apply hooks

After pulling a commit, `dotfiles sync` runs executable `*.sh` files under
`install/apply.d/` in filename order. The current hook applies symlinks.

The command records the successfully applied commit in:

```text
~/.local/state/dotfiles/applied-head
```

It writes the marker only after every hook succeeds. A failed hook therefore
runs again on the next sync. New setup work should be added as an idempotent
hook rather than added to the routine app updater.

## Updating SSH machines

Create an untracked host list on the laptop:

```bash
mkdir -p ~/.config/dotfiles
cat > ~/.config/dotfiles/hosts <<'EOF'
server-one
server-two
user@workstation
EOF
```

Run the normal update on each host, sequentially:

```bash
dotfiles-fleet update
```

Other supported fleet commands are `sync`, `apps`, and `system`. The `system`
command requests a TTY because sudo may prompt. Set `DOTFILES_HOSTS` to use a
different host-list file.

The remote machines must already have this repository installed and
`~/.scripts` linked. After deploying this change once, later runs use the new
updater.

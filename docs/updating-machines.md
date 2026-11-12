# Updating machines

The installer and updater have separate jobs. Use the complete installer on a
new machine (see `new-arch-machine.md` for Arch). Use the cheaper update
commands for routine work.

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

# Upgrade system packages and install packages newly added to
# install/packages_<os>.sh. This is the only routine command that uses sudo.
dotfiles system

# Rerun the one-time Arch setup after adding a step to install/setup_arch.sh.
dotfiles setup

# Run the complete installer on a new machine.
dotfiles bootstrap
```

`dotfiles sync` refuses to pull when the repository has local changes. Commit,
stash, or remove those changes first. It also uses `git pull --ff-only`, so it
will not create an unexpected merge commit.

The default `apps` set is delta, eza, fd, fzf, herdr, Neovim, ripgrep, tmux,
and win32yank (WSL only).
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
`install/apply.d/` in filename order. The hooks apply symlinks and, on WSL,
copy the SSH config to the Windows profile for Windows apps such as the Herdr
GUI. Windows OpenSSH cannot include files from WSL. The first copy backs up a
hand-written Windows config to `config.bak.<timestamp>`.

The command records the successfully applied commit in:

```text
~/.local/state/dotfiles/applied-head
```

It writes the marker only after every hook succeeds. A failed hook therefore
runs again on the next sync. New setup work should be added as an idempotent
hook rather than added to the routine app updater.

## Updating SSH machines

The laptop keeps an untracked host list in `~/.config/dotfiles/hosts`, one SSH
destination per line. Manage it with:

```bash
dotfiles-fleet add user@workstation
dotfiles-fleet remove user@workstation
dotfiles-fleet list
```

`add` first tries a key login. If that fails, it runs `ssh-copy-id`, which
asks for the password once, and then checks the key login again. It only lists
the host once a key login works. It warns when the host does not have dotfiles
installed yet. `remove` only edits the list; it does not revoke the key on the
host.

On WSL, when the Windows Herdr app's `hc.exe` is on `PATH`, `add` also adds the
host to Herdr. Herdr uses Windows OpenSSH, which has its own ssh-agent and
`known_hosts`. `add` therefore checks a key login with `ssh.exe` first (and
records the host key), then runs `hc.exe machine add HOST --install`. It skips
hosts Herdr already has, matched by the remote hostname. Herdr sorts machines
by name, so `add` names the machine `N-LABEL`, with N one above the highest
existing number prefix. LABEL is the remote hostname without `ch03wx`, or the
optional second argument: `dotfiles-fleet add user@workstation ws`. If the Windows
ssh-agent lacks the key, it warns and leaves Herdr alone. `remove` does not
remove the machine from Herdr; use `hc.exe machine rm NAME`.

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

#!/usr/bin/env bash
# Exercise the dotfiles command through its public CLI.
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
DOTFILES_BIN="$ROOT/scripts/dotfiles"
DOTFILES_FLEET_BIN="$ROOT/scripts/dotfiles-fleet"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

assert_file_contains() {
    local file=$1
    local expected=$2
    [[ -f "$file" ]] || fail "$file does not exist"
    grep -Fxq "$expected" "$file" || fail "$file does not contain: $expected"
}

create_sync_fixture() {
    local seed="$TMP_DIR/seed"
    local remote="$TMP_DIR/remote.git"
    local checkout="$TMP_DIR/checkout"

    git init -q --bare "$remote"
    git init -q "$seed"
    git -C "$seed" config user.email test@example.com
    git -C "$seed" config user.name Test
    mkdir -p "$seed/install/apply.d"
    cat > "$seed/install/apply.d/10-record.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$(git rev-parse HEAD)" >> "$HOME/applied-heads"
SCRIPT
    chmod +x "$seed/install/apply.d/10-record.sh"
    git -C "$seed" add .
    git -C "$seed" commit -qm initial
    git -C "$seed" branch -M main
    git -C "$seed" remote add origin "$remote"
    git -C "$seed" push -q -u origin main
    git --git-dir="$remote" symbolic-ref HEAD refs/heads/main
    git clone -q "$remote" "$checkout"

    printf 'changed\n' > "$seed/change"
    git -C "$seed" add change
    git -C "$seed" commit -qm change
    git -C "$seed" push -q

    printf '%s\n' "$checkout"
}

# A sync pulls fast-forward changes, runs apply hooks, and records the applied commit.
test_sync_pulls_and_applies_once() {
    local checkout home expected
    checkout=$(create_sync_fixture)
    home="$TMP_DIR/home"
    mkdir -p "$home"
    expected=$(git --git-dir="$TMP_DIR/remote.git" rev-parse main)

    HOME="$home" DOTFILES_DIR="$checkout" "$DOTFILES_BIN" sync >/dev/null

    [[ $(git -C "$checkout" rev-parse HEAD) == "$expected" ]] || fail "sync did not pull the latest commit"
    assert_file_contains "$home/applied-heads" "$expected"
    assert_file_contains "$home/.local/state/dotfiles/applied-head" "$expected"

    HOME="$home" DOTFILES_DIR="$checkout" "$DOTFILES_BIN" sync >/dev/null
    [[ $(wc -l < "$home/applied-heads") == 1 ]] || fail "sync reapplied an already applied commit"
}

# The default app update runs version-aware tools and skips interactive installers.
test_apps_default_skips_maintenance() {
    local repo="$TMP_DIR/apps-repo"
    local log="$TMP_DIR/apps.log"
    local app
    mkdir -p "$repo/install/apps"
    cp "$ROOT/install/apps/update_apps.sh" "$repo/install/apps/update_apps.sh"

    for app in delta eza fd fzf herdr nvim opencode ripgrep tmux zsh; do
        cat > "$repo/install/apps/$app.sh" <<SCRIPT
#!/usr/bin/env bash
printf '%s\\n' '$app' >> '$log'
SCRIPT
        chmod +x "$repo/install/apps/$app.sh"
    done

    DOTFILES_DIR="$repo" "$DOTFILES_BIN" apps >/dev/null

    for app in delta eza fd fzf herdr nvim ripgrep tmux; do
        assert_file_contains "$log" "$app"
    done
    ! grep -Fxq opencode "$log" || fail "default apps update ran opencode"
    ! grep -Fxq zsh "$log" || fail "default apps update ran zsh"

    : > "$log"
    DOTFILES_DIR="$repo" "$DOTFILES_BIN" apps herdr fzf >/dev/null
    [[ $(wc -l < "$log") == 2 ]] || fail "named app update ran an unexpected number of installers"
    [[ $(head -n1 "$log") == herdr ]] || fail "named app update did not preserve argument order"
    [[ $(tail -n1 "$log") == fzf ]] || fail "named app update did not run fzf"
}

# A full update syncs configuration before checking user applications.
test_update_syncs_before_apps() {
    local seed="$TMP_DIR/update-seed"
    local remote="$TMP_DIR/update-remote.git"
    local checkout="$TMP_DIR/update-checkout"
    local home="$TMP_DIR/update-home"
    local expected

    git init -q --bare "$remote"
    git init -q "$seed"
    git -C "$seed" config user.email test@example.com
    git -C "$seed" config user.name Test
    mkdir -p "$seed/install/apply.d" "$seed/install/apps" "$home"
    cat > "$seed/install/apply.d/10-record.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'apply:%s\n' "$(git rev-parse HEAD)" >> "$HOME/update-order"
SCRIPT
    cat > "$seed/install/apps/update_apps.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'apps:%s\n' "$(git -C "$DOTFILES_DIR" rev-parse HEAD)" >> "$HOME/update-order"
SCRIPT
    chmod +x "$seed/install/apply.d/10-record.sh" "$seed/install/apps/update_apps.sh"
    git -C "$seed" add .
    git -C "$seed" commit -qm initial
    git -C "$seed" branch -M main
    git -C "$seed" remote add origin "$remote"
    git -C "$seed" push -q -u origin main
    git --git-dir="$remote" symbolic-ref HEAD refs/heads/main
    git clone -q "$remote" "$checkout"

    printf 'changed\n' > "$seed/change"
    git -C "$seed" add change
    git -C "$seed" commit -qm change
    git -C "$seed" push -q
    expected=$(git -C "$seed" rev-parse HEAD)

    HOME="$home" DOTFILES_DIR="$checkout" "$DOTFILES_BIN" update >/dev/null

    [[ $(head -n1 "$home/update-order") == "apply:$expected" ]] || fail "update did not apply the pulled commit first"
    [[ $(tail -n1 "$home/update-order") == "apps:$expected" ]] || fail "update did not update apps after sync"
}

# System updates are explicit and reconcile declared packages after upgrading.
test_system_updates_ubuntu_packages() {
    local repo="$TMP_DIR/system-repo"
    local fake_bin="$TMP_DIR/system-bin"
    local log="$TMP_DIR/system.log"
    mkdir -p "$repo/install" "$fake_bin"

    cat > "$fake_bin/sudo" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
exec "$@"
SCRIPT
    cat > "$fake_bin/apt-get" <<SCRIPT
#!/usr/bin/env bash
printf 'apt-get:%s\\n' "\$*" >> '$log'
SCRIPT
    cat > "$repo/install/packages_ubuntu.sh" <<SCRIPT
#!/usr/bin/env bash
printf '%s\\n' packages-ubuntu >> '$log'
SCRIPT
    chmod +x "$fake_bin/sudo" "$fake_bin/apt-get" "$repo/install/packages_ubuntu.sh"

    PATH="$fake_bin:$PATH" DOTFILES_OS_ID=ubuntu DOTFILES_DIR="$repo" "$DOTFILES_BIN" system >/dev/null

    [[ $(sed -n '1p' "$log") == "apt-get:update" ]] || fail "system did not refresh apt first"
    [[ $(sed -n '2p' "$log") == "apt-get:upgrade -y" ]] || fail "system did not upgrade apt packages"
    [[ $(sed -n '3p' "$log") == "packages-ubuntu" ]] || fail "system did not reconcile Ubuntu packages"
}

# Bootstrap delegates to the complete installer.
test_bootstrap_runs_full_installer() {
    local repo="$TMP_DIR/bootstrap-repo"
    local log="$TMP_DIR/bootstrap.log"
    mkdir -p "$repo"
    cat > "$repo/install.sh" <<SCRIPT
#!/usr/bin/env bash
printf '%s\\n' ran > '$log'
SCRIPT
    chmod +x "$repo/install.sh"

    DOTFILES_DIR="$repo" "$DOTFILES_BIN" bootstrap >/dev/null

    assert_file_contains "$log" ran
}

# Fleet updates ignore comments and invoke the same command on each host.
test_fleet_updates_configured_hosts() {
    local fake_bin="$TMP_DIR/fleet-bin"
    local hosts="$TMP_DIR/hosts"
    local log="$TMP_DIR/fleet.log"
    mkdir -p "$fake_bin"
    cat > "$hosts" <<'EOF'
# Personal machines
host-a

server@example.test
EOF
    cat > "$fake_bin/ssh" <<SCRIPT
#!/usr/bin/env bash
printf '%s|%s\\n' "\$1" "\$2" >> '$log'
SCRIPT
    chmod +x "$fake_bin/ssh"

    PATH="$fake_bin:$PATH" DOTFILES_HOSTS="$hosts" "$DOTFILES_FLEET_BIN" update >/dev/null

    [[ $(sed -n '1p' "$log") == 'host-a|~/.scripts/dotfiles update' ]] || fail "fleet did not update host-a"
    [[ $(sed -n '2p' "$log") == 'server@example.test|~/.scripts/dotfiles update' ]] || fail "fleet did not update the SSH destination"
    [[ $(wc -l < "$log") == 2 ]] || fail "fleet invoked unexpected hosts"
}

test_sync_pulls_and_applies_once
test_apps_default_skips_maintenance
test_update_syncs_before_apps
test_system_updates_ubuntu_packages
test_bootstrap_runs_full_installer
test_fleet_updates_configured_hosts

echo "PASS: dotfiles CLI"

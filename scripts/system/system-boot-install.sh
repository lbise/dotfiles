#!/usr/bin/env bash
# Install the VOIDSTATION Plymouth boot splash on this machine.
#
#   bash scripts/system/system-boot-install.sh --dry-run   show what would change
#   bash scripts/system/system-boot-install.sh             install (asks for sudo)
#
# Run as your user, not with sudo: the art is generated as your user and only
# the system writes go through sudo. Every changed system file is backed up to
# /var/lib/leo-boot-install/backups/<timestamp>/ first.
#
# Changes:
#   - installs the plymouth package
#   - generates the theme for this machine's screen sizes and copies it to
#     /usr/share/plymouth/themes/voidstation
#   - /etc/plymouth/plymouthd.conf: Theme=voidstation
#   - /etc/mkinitcpio.conf: adds the plymouth hook (after systemd or udev, so
#     before sd-encrypt). NVIDIA machines also get early KMS modules.
#   - kernel options: adds "quiet splash" (plus nvidia_drm.modeset=1 on
#     NVIDIA). systemd-boot: each entry first gets a "(no splash)" copy as a
#     fallback. GRUB: GRUB_CMDLINE_LINUX_DEFAULT, then grub-mkconfig.
#   - rebuilds the initramfs (mkinitcpio -P)
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GENERATOR="$DOTFILES_ROOT/dot/.config/leo/boot/voidstation.py"

THEME_NAME=voidstation
THEME_DIR=/usr/share/plymouth/themes/$THEME_NAME
PLYMOUTHD_CONF=/etc/plymouth/plymouthd.conf
MKINITCPIO_CONF=/etc/mkinitcpio.conf
LOADER_ENTRIES=/boot/loader/entries
GRUB_DEFAULT=/etc/default/grub
GRUB_CFG=/boot/grub/grub.cfg
BACKUP_ROOT=/var/lib/leo-boot-install/backups
NVIDIA_MODULES=(nvidia nvidia_modeset nvidia_uvm nvidia_drm)

DRY_RUN=0
BACKUP_DIR=""
WORK_DIR=""

usage() {
    sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
}

step() { echo ">> $*"; }
note() { echo "   $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

cleanup() {
    [[ -n "$WORK_DIR" ]] && rm -rf "$WORK_DIR"
}
trap cleanup EXIT

# ---------------------------------------------------------------- detection

# Whole-number scales of the 320x180 scene for every connected screen.
detect_scales() {
    local c mode w h s scales=()
    for c in /sys/class/drm/card*-*; do
        [[ -r "$c/status" && "$(cat "$c/status")" == connected ]] || continue
        mode=$(head -n1 "$c/modes" 2>/dev/null || true)
        [[ "$mode" =~ ^([0-9]+)x([0-9]+) ]] || continue
        w=${BASH_REMATCH[1]} h=${BASH_REMATCH[2]}
        s=$(( w / 320 < h / 180 ? w / 320 : h / 180 ))
        (( s >= 1 )) && scales+=("$s")
    done
    if (( ${#scales[@]} == 0 )); then
        echo "6,8"
    else
        printf '%s\n' "${scales[@]}" | sort -nu | paste -sd,
    fi
}

has_nvidia() {
    lspci -k 2>/dev/null | grep -A3 -E 'VGA|3D' | grep -q 'Kernel driver in use: nvidia'
}

boot_loader() {
    if [[ -d "$LOADER_ENTRIES" ]] && compgen -G "$LOADER_ENTRIES/*.conf" >/dev/null; then
        echo systemd-boot
    elif [[ -f "$GRUB_DEFAULT" ]]; then
        echo grub
    else
        echo unknown
    fi
}

# ---------------------------------------------------------------- file edits

backup() {
    local f=$1
    [[ -e "$f" ]] || return 0
    if [[ -z "$BACKUP_DIR" ]]; then
        BACKUP_DIR="$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)"
        sudo mkdir -p "$BACKUP_DIR"
    fi
    sudo mkdir -p "$BACKUP_DIR$(dirname "$f")"
    sudo cp -a "$f" "$BACKUP_DIR$f"
}

# Replace a root-owned file with new content (from a temp file), showing the
# diff. Dry runs only show the diff.
apply_file() {
    local dst=$1 new=$2 mode=${3:-644}
    if [[ -f "$dst" ]] && cmp -s "$dst" "$new"; then
        note "$dst already up to date"
        return 0
    fi
    if [[ -e "$dst" ]]; then
        diff -u --label "$dst" --label "$dst (new)" "$dst" "$new" | sed 's/^/   /' || true
    else
        note "new file $dst:"
        sed 's/^/   + /' "$new"
    fi
    (( DRY_RUN )) && return 0
    backup "$dst"
    sudo install -D -m "$mode" "$new" "$dst"
    note "wrote $dst"
}

# mkinitcpio.conf: plymouth hook after systemd (systemd initramfs) or udev
# (busybox), so it starts before sd-encrypt/encrypt asks for the passphrase.
# NVIDIA: load the driver in the initramfs (early KMS) and drop the kms hook,
# which would pull nouveau in.
edit_mkinitcpio() {
    local nvidia=$1
    python3 - "$MKINITCPIO_CONF" "$nvidia" "${NVIDIA_MODULES[@]}" <<'PY'
import re
import sys

path, nvidia, mods = sys.argv[1], sys.argv[2] == "1", sys.argv[3:]
text = open(path).read()


def edit(name, fn):
    global text
    m = re.search(rf"^{name}=\((.*?)\)", text, re.M | re.S)
    if not m:
        sys.exit(f"{path}: no {name}=(...) line")
    items = m.group(1).split()
    new = fn(items)
    text = text[:m.start()] + f"{name}=({' '.join(new)})" + text[m.end():]


def hooks(items):
    if "plymouth" not in items:
        anchor = "systemd" if "systemd" in items else "udev" if "udev" in items else None
        if anchor is None:
            sys.exit(f"{path}: HOOKS has neither systemd nor udev")
        items.insert(items.index(anchor) + 1, "plymouth")
    for crypt in ("sd-encrypt", "encrypt"):
        if crypt in items and items.index(crypt) < items.index("plymouth"):
            sys.exit(f"{path}: {crypt} comes before plymouth; fix HOOKS by hand")
    if nvidia and "kms" in items:
        items.remove("kms")
    return items


def modules(items):
    return items + [m for m in mods if m not in items] if nvidia else items


edit("HOOKS", hooks)
edit("MODULES", modules)
sys.stdout.write(text)
PY
}

add_options() {
    # Append kernel options that are not already present.
    local line=$1; shift
    local opt
    for opt in "$@"; do
        [[ " $line " == *" $opt "* ]] || line="$line $opt"
    done
    echo "$line"
}

# ---------------------------------------------------------------- steps

install_package() {
    if pacman -Qq plymouth >/dev/null 2>&1; then
        note "plymouth already installed"
    elif (( DRY_RUN )); then
        note "would install plymouth"
    else
        sudo pacman -S --needed --noconfirm plymouth
    fi
}

install_theme() {
    local scales=$1
    python3 "$GENERATOR" plymouth "$WORK_DIR/theme" --scales "$scales" 2>&1 | sed 's/^/   /'
    note "$(find "$WORK_DIR/theme" -type f | wc -l) files, $(du -sh "$WORK_DIR/theme" | cut -f1)"
    if [[ -d "$THEME_DIR" ]] && diff -rq "$THEME_DIR" "$WORK_DIR/theme" >/dev/null 2>&1; then
        note "$THEME_DIR already up to date"
        return 0
    fi
    if (( DRY_RUN )); then
        note "would replace $THEME_DIR"
        return 0
    fi
    sudo rm -rf "$THEME_DIR.new"
    sudo cp -r "$WORK_DIR/theme" "$THEME_DIR.new"
    sudo chmod -R u=rwX,go=rX "$THEME_DIR.new"
    sudo rm -rf "$THEME_DIR"
    sudo mv "$THEME_DIR.new" "$THEME_DIR"
    note "installed $THEME_DIR"
}

configure_plymouthd() {
    local new=$WORK_DIR/plymouthd.conf
    # DeviceScale=1: the theme does its own whole-number scaling.
    printf '[Daemon]\nTheme=%s\nShowDelay=0\nDeviceScale=1\n' "$THEME_NAME" > "$new"
    apply_file "$PLYMOUTHD_CONF" "$new"
}

configure_mkinitcpio() {
    local nvidia=$1 new=$WORK_DIR/mkinitcpio.conf f
    for f in /etc/mkinitcpio.conf.d/*.conf; do
        [[ -e "$f" ]] && grep -qE '^(HOOKS|MODULES)=' "$f" &&
            echo "WARNING: $f sets HOOKS or MODULES and overrides $MKINITCPIO_CONF" >&2
    done
    edit_mkinitcpio "$nvidia" > "$new"
    apply_file "$MKINITCPIO_CONF" "$new"
}

configure_systemd_boot() {
    local opts=("$@") entry base fallback new line
    for entry in "$LOADER_ENTRIES"/*.conf; do
        base=$(basename "$entry" .conf)
        [[ "$base" == *-nosplash ]] && continue
        fallback="$LOADER_ENTRIES/$base-nosplash.conf"
        if [[ ! -e "$fallback" ]]; then
            new=$WORK_DIR/$base-nosplash.conf
            sed -E 's/^(title[[:space:]]+.*)$/\1 (no splash)/' "$entry" > "$new"
            apply_file "$fallback" "$new"
        fi
        new=$WORK_DIR/$base.conf
        : > "$new"
        while IFS= read -r line || [[ -n "$line" ]]; do
            if [[ "$line" =~ ^options[[:space:]] ]]; then
                line=$(add_options "$line" "${opts[@]}")
            fi
            printf '%s\n' "$line" >> "$new"
        done < "$entry"
        apply_file "$entry" "$new"
    done
}

configure_grub() {
    local opts=("$@") new=$WORK_DIR/grub cur
    cur=$(sed -nE 's/^GRUB_CMDLINE_LINUX_DEFAULT="(.*)"$/\1/p' "$GRUB_DEFAULT")
    cur=$(add_options "$cur" "${opts[@]}")
    cur=${cur# }
    sed -E "s|^GRUB_CMDLINE_LINUX_DEFAULT=\".*\"$|GRUB_CMDLINE_LINUX_DEFAULT=\"$cur\"|" "$GRUB_DEFAULT" > "$new"
    if cmp -s "$GRUB_DEFAULT" "$new"; then
        note "$GRUB_DEFAULT already up to date"
        return 0
    fi
    apply_file "$GRUB_DEFAULT" "$new"
    if (( DRY_RUN )); then
        note "would run grub-mkconfig -o $GRUB_CFG"
    else
        backup "$GRUB_CFG"
        sudo grub-mkconfig -o "$GRUB_CFG"
    fi
}

rebuild_initramfs() {
    if (( DRY_RUN )); then
        note "would run mkinitcpio -P"
    else
        sudo mkinitcpio -P
    fi
}

main() {
    while (( $# )); do
        case $1 in
            --dry-run) DRY_RUN=1 ;;
            -h|--help) usage; exit 0 ;;
            *) usage >&2; exit 2 ;;
        esac
        shift
    done
    (( EUID != 0 )) || die "run as your user, not root; it uses sudo when needed"
    grep -qi '^ID=arch' /etc/os-release || die "Arch Linux only"
    command -v python3 >/dev/null || die "python3 is required"
    [[ -f "$GENERATOR" ]] || die "missing $GENERATOR"

    WORK_DIR=$(mktemp -d)
    local scales nvidia=0 loader opts=(quiet splash)
    scales=$(detect_scales)
    has_nvidia && nvidia=1
    (( nvidia )) && opts+=(nvidia_drm.modeset=1)
    loader=$(boot_loader)

    step "Machine: scales $scales, boot loader $loader, NVIDIA $( (( nvidia )) && echo yes || echo no )"
    (( DRY_RUN )) && note "dry run: nothing is written"
    [[ "$loader" != unknown ]] || die "no systemd-boot entries in $LOADER_ENTRIES and no $GRUB_DEFAULT"

    step "Installing plymouth"
    install_package
    step "Generating and installing the theme"
    install_theme "$scales"
    step "Configuring plymouthd"
    configure_plymouthd
    step "Configuring mkinitcpio"
    configure_mkinitcpio "$nvidia"
    step "Adding kernel options: ${opts[*]}"
    if [[ "$loader" == systemd-boot ]]; then
        configure_systemd_boot "${opts[@]}"
    else
        configure_grub "${opts[@]}"
    fi
    step "Rebuilding the initramfs"
    rebuild_initramfs

    if (( DRY_RUN )); then
        step "Dry run complete"
    else
        step "Done. Backups: ${BACKUP_DIR:-none needed}"
        note "Preview without rebooting: bash scripts/system/system-boot-preview.sh"
    fi
}

main "$@"

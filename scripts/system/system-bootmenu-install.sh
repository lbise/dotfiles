#!/usr/bin/env bash
# Install rEFInd with the VOIDSTATION theme as this machine's boot menu.
#
#   bash scripts/system/system-bootmenu-install.sh --dry-run   show what would change
#   bash scripts/system/system-bootmenu-install.sh             install (asks for sudo)
#
# Run as your user, after system-boot-install.sh (the Plymouth splash). Every
# changed file and the previous firmware boot order are backed up to
# /var/lib/leo-boot-install/backups/<timestamp>/ first.
#
# Changes:
#   - installs the refind package and copies rEFInd to <ESP>/EFI/refind
#   - generates the theme for the largest connected screen
#   - writes <ESP>/EFI/refind/refind.conf with manual entries only:
#       Arch Linux: kernel options from the running system, plus "quiet
#       splash"; its submenu (F2 or Insert) offers no splash, the fallback
#       initramfs if present, and the previous boot menu
#       (systemd-boot or GRUB, left installed)
#       Windows: only if the firmware has a Windows Boot Manager entry
#   - adds a firmware boot entry called VOIDSTATION. If Windows Boot Manager
#     is first in the boot order it stays first and VOIDSTATION goes second
#     (pick it with the firmware boot key); otherwise VOIDSTATION goes first.
#   - adds a pacman hook that copies rEFInd to the ESP after package upgrades
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GENERATOR="$DOTFILES_ROOT/dot/.config/leo/boot/voidstation.py"

ESP=/boot
REFIND_SRC=/usr/share/refind/refind_x64.efi
REFIND_DIR=$ESP/EFI/refind
REFIND_LOADER='\EFI\refind\refind_x64.efi'
THEME_REL=themes/voidstation
LABEL=VOIDSTATION
PACMAN_HOOK=/etc/pacman.d/hooks/refind.hook
PLYMOUTH_THEME=/usr/share/plymouth/themes/voidstation
BACKUP_ROOT=/var/lib/leo-boot-install/backups
TIMEOUT=3

DRY_RUN=0
BACKUP_DIR=""
WORK_DIR=""

usage() { sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; }
step() { echo ">> $*"; }
note() { echo "   $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }
cleanup() { [[ -n "$WORK_DIR" ]] && rm -rf "$WORK_DIR"; }
trap cleanup EXIT

backup_dir() {
    if [[ -z "$BACKUP_DIR" ]]; then
        BACKUP_DIR="$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)"
        sudo mkdir -p "$BACKUP_DIR"
    fi
}

backup() {
    local f=$1
    [[ -e "$f" ]] || return 0
    backup_dir
    sudo mkdir -p "$BACKUP_DIR$(dirname "$f")"
    sudo cp -a "$f" "$BACKUP_DIR$f"
}

apply_file() {
    local dst=$1 new=$2
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
    sudo install -D -m 644 "$new" "$dst"
    note "wrote $dst"
}

# ---------------------------------------------------------------- detection

# Largest preferred mode among connected screens, as "W H".
detect_screen() {
    local c mode best=0 out=""
    for c in /sys/class/drm/card*-*; do
        [[ -r "$c/status" && "$(cat "$c/status")" == connected ]] || continue
        mode=$(head -n1 "$c/modes" 2>/dev/null || true)
        [[ "$mode" =~ ^([0-9]+)x([0-9]+) ]] || continue
        if (( BASH_REMATCH[1] * BASH_REMATCH[2] > best )); then
            best=$(( BASH_REMATCH[1] * BASH_REMATCH[2] ))
            out="${BASH_REMATCH[1]} ${BASH_REMATCH[2]}"
        fi
    done
    [[ -n "$out" ]] || die "no connected screen found in /sys/class/drm"
    echo "$out"
}

secure_boot_enabled() {
    local v
    v=$(od -An -tu1 /sys/firmware/efi/efivars/SecureBoot-8be4df61-93ca-11d2-aa0d-00e098032b8c 2>/dev/null |
        awk '{print $NF}')
    [[ "$v" == 1 ]]
}

has_nvidia() {
    lspci -k 2>/dev/null | grep -A3 -E 'VGA|3D' | grep -q 'Kernel driver in use: nvidia'
}

# Kernel options of the running system without the boot loader's own
# arguments and without quiet/splash (added back per entry).
base_options() {
    local tok out=()
    for tok in $(cat /proc/cmdline); do
        case $tok in
            BOOT_IMAGE=*|initrd=*|quiet|splash) ;;
            *) out+=("$tok") ;;
        esac
    done
    if has_nvidia && [[ " ${out[*]} " != *" nvidia_drm.modeset=1 "* ]]; then
        out+=(nvidia_drm.modeset=1)
    fi
    echo "${out[*]}"
}

# "initrd=\x.img" arguments: CPU microcode first, then the given initramfs.
initrd_args() {
    local img=$1 f out=()
    for f in intel-ucode.img amd-ucode.img; do
        [[ -f "$ESP/$f" ]] && out+=("initrd=\\$f")
    done
    out+=("initrd=\\$img")
    echo "${out[*]}"
}

# Windows Boot Manager from the firmware entries, if its partition exists:
# prints "BOOTNUM PARTUUID".
windows_entry() {
    local line num guid
    line=$(efibootmgr 2>/dev/null | grep -i 'Windows Boot Manager' | head -n1 || true)
    [[ -n "$line" ]] || return 0
    [[ "$line" =~ ^Boot([0-9A-Fa-f]{4}) ]] || return 0
    num=${BASH_REMATCH[1]}
    [[ "$line" =~ HD\([0-9]+,GPT,([0-9a-fA-F-]{36}) ]] || return 0
    guid=${BASH_REMATCH[1]}
    lsblk -no PARTUUID | grep -qix "$guid" || return 0
    echo "$num ${guid^^}"
}

previous_loader() {
    local f
    if [[ -f "$ESP/EFI/systemd/systemd-bootx64.efi" ]]; then
        echo 'systemd-boot \EFI\systemd\systemd-bootx64.efi'
        return
    fi
    for f in "$ESP"/EFI/*/grubx64.efi; do
        [[ -f "$f" ]] || continue
        f=${f#"$ESP"}
        echo "GRUB ${f//\//\\}"
        return
    done
}

# ---------------------------------------------------------------- steps

install_package() {
    if pacman -Qq refind >/dev/null 2>&1; then
        note "refind already installed"
    elif (( DRY_RUN )); then
        note "would install refind"
    else
        sudo pacman -S --needed --noconfirm refind
    fi
}

write_conf() {
    local out=$1 width=$2 height=$3 sizes=$4 base main nosplash fallback prev win
    base=$(base_options)
    [[ " $base " == *" root="* ]] || die "no root= in /proc/cmdline; cannot build the Arch entry"
    main="$(initrd_args initramfs-linux.img) $base quiet splash"
    nosplash="$(initrd_args initramfs-linux.img) $base"
    prev=$(previous_loader)
    win=$(windows_entry)
    {
        echo "# Generated by scripts/system/system-bootmenu-install.sh: re-run it instead of editing."
        echo "timeout $TIMEOUT"
        echo "use_nvram false"
        echo "resolution $width $height"
        echo "hideui hints,arrows,badges,editor"
        echo "banner $THEME_REL/background.png"
        echo "banner_scale noscale"
        echo "icons_dir $THEME_REL/icons"
        echo "selection_big $THEME_REL/selection-big.png"
        echo "selection_small $THEME_REL/selection-small.png"
        echo "font $THEME_REL/font.png"
        cat "$sizes"
        echo "showtools shutdown,reboot,firmware"
        echo "scanfor manual"
        echo 'default_selection "Arch Linux"'
        echo
        echo 'menuentry "Arch Linux" {'
        echo "    icon     EFI/refind/$THEME_REL/icons/os_arch.png"
        echo "    ostype   Linux"
        echo "    graphics on"
        echo "    loader   /vmlinuz-linux"
        echo "    options  \"$main\""
        echo '    submenuentry "Boot without splash" {'
        echo "        options \"$nosplash\""
        echo '    }'
        if [[ -f "$ESP/initramfs-linux-fallback.img" ]]; then
            fallback="$(initrd_args initramfs-linux-fallback.img) $base"
            echo '    submenuentry "Boot with fallback initramfs" {'
            echo "        options \"$fallback\""
            echo '    }'
        fi
        if [[ -n "$prev" ]]; then
            echo "    submenuentry \"Previous boot menu (${prev%% *})\" {"
            echo "        loader ${prev#* }"
            echo '        options ""'
            echo '    }'
        fi
        echo '}'
        if [[ -n "$win" ]]; then
            echo
            echo 'menuentry "Windows" {'
            echo "    icon     EFI/refind/$THEME_REL/icons/os_win.png"
            echo "    ostype   Windows"
            echo "    graphics on"
            echo "    volume   ${win#* }"
            echo '    loader   \EFI\Microsoft\Boot\bootmgfw.efi'
            echo '}'
        fi
    } > "$out"
}

install_files() {
    local width=$1 height=$2 theme=$WORK_DIR/theme conf=$WORK_DIR/refind.conf
    python3 "$GENERATOR" refind "$theme" --width "$width" --height "$height" 2>&1 | sed 's/^/   /'
    write_conf "$conf" "$width" "$height" "$theme/sizes.conf"
    rm -f "$theme/sizes.conf"

    if (( DRY_RUN )); then
        note "would copy $REFIND_SRC to $REFIND_DIR/refind_x64.efi"
        note "would replace $REFIND_DIR/$THEME_REL"
    else
        [[ -f "$REFIND_SRC" ]] || die "missing $REFIND_SRC"
        if ! cmp -s "$REFIND_SRC" "$REFIND_DIR/refind_x64.efi"; then
            sudo install -D -m 644 "$REFIND_SRC" "$REFIND_DIR/refind_x64.efi"
            note "installed $REFIND_DIR/refind_x64.efi"
        fi
        sudo rm -rf "$REFIND_DIR/$THEME_REL"
        sudo mkdir -p "$REFIND_DIR/themes"
        sudo cp -r "$theme" "$REFIND_DIR/$THEME_REL"
        note "installed $REFIND_DIR/$THEME_REL"
    fi
    apply_file "$REFIND_DIR/refind.conf" "$conf"
}

install_pacman_hook() {
    local new=$WORK_DIR/refind.hook
    cat > "$new" <<EOF
[Trigger]
Operation = Upgrade
Type = Package
Target = refind

[Action]
Description = Copying rEFInd to the ESP
When = PostTransaction
Exec = /usr/bin/install -m 644 $REFIND_SRC $REFIND_DIR/refind_x64.efi
EOF
    apply_file "$PACMAN_HOOK" "$new"
}

# Boot number of the firmware entry that loads rEFInd from this ESP, if any.
refind_bootnum() {
    efibootmgr | grep -i "$1" | grep -iF "$REFIND_LOADER" |
        sed -nE 's/^Boot([0-9A-Fa-f]{4}).*/\1/p' | head -n1 || true
}

# Firmware entry and boot order.
configure_firmware() {
    local src disk part partuuid order num win_num new_order rest o
    src=$(findmnt -no SOURCE "$ESP")
    disk=/dev/$(lsblk -no PKNAME "$src")
    part=$(cat "/sys/class/block/$(basename "$src")/partition")
    partuuid=$(lsblk -no PARTUUID "$src")

    num=$(refind_bootnum "$partuuid")
    if [[ -z "$num" ]]; then
        if (( DRY_RUN )); then
            note "would run: efibootmgr --create --disk $disk --part $part --loader '$REFIND_LOADER' --label $LABEL --unicode"
            num=NEW
        else
            backup_dir
            efibootmgr | sudo tee "$BACKUP_DIR/efibootmgr-before.txt" >/dev/null
            sudo efibootmgr --quiet --create --disk "$disk" --part "$part" \
                --loader "$REFIND_LOADER" --label "$LABEL" --unicode
            num=$(refind_bootnum "$partuuid")
            [[ -n "$num" ]] || die "efibootmgr did not create the $LABEL entry"
            note "created firmware entry Boot$num $LABEL"
        fi
    else
        note "firmware entry Boot$num already points at rEFInd"
    fi

    order=$(efibootmgr | sed -nE 's/^BootOrder: //p')
    win_num=$(windows_entry | cut -d' ' -f1)
    rest=""
    for o in ${order//,/ }; do
        [[ "${o^^}" == "${num^^}" || ( -n "$win_num" && "${o^^}" == "${win_num^^}" ) ]] && continue
        rest+=",$o"
    done
    if [[ -n "$win_num" && "${order%%,*}" == "$win_num" ]]; then
        new_order="$win_num,$num$rest"
        note "Windows Boot Manager stays first; $LABEL is second (use the firmware boot key)"
    else
        new_order="$num$rest"
    fi
    if [[ "$new_order" == "$order" ]]; then
        note "boot order already $order"
    elif (( DRY_RUN )); then
        note "would set boot order: $order -> $new_order"
    else
        sudo efibootmgr --quiet --bootorder "$new_order"
        note "boot order: $order -> $new_order"
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
    [[ -d /sys/firmware/efi ]] || die "not booted in UEFI mode"
    secure_boot_enabled && die "Secure Boot is on; rEFInd is not signed for it here"
    [[ "$(findmnt -no FSTYPE "$ESP")" == vfat && -d "$ESP/EFI" ]] ||
        die "$ESP is not a FAT EFI system partition"
    [[ -f "$ESP/vmlinuz-linux" && -f "$ESP/initramfs-linux.img" ]] ||
        die "kernel and initramfs are not on $ESP"
    [[ -d "$PLYMOUTH_THEME" ]] || die "run system-boot-install.sh first (no $PLYMOUTH_THEME)"
    [[ -f "$GENERATOR" ]] || die "missing $GENERATOR"

    WORK_DIR=$(mktemp -d)
    local width height
    read -r width height < <(detect_screen)
    step "Screen ${width}x${height}, ESP $(findmnt -no SOURCE "$ESP")"
    (( DRY_RUN )) && note "dry run: nothing is written"

    step "Installing refind"
    install_package
    step "Installing rEFInd, theme and refind.conf"
    install_files "$width" "$height"
    step "Installing the pacman hook"
    install_pacman_hook
    step "Configuring the firmware boot entry"
    configure_firmware

    if (( DRY_RUN )); then
        step "Dry run complete"
    else
        step "Done. Backups: ${BACKUP_DIR:-none needed}"
    fi
}

main "$@"

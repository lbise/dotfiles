#!/bin/env bash
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
WOW_WIN_PATH="/mnt/c/Program Files (x86)/World of Warcraft"
ADDON_WIN_PATH="$WOW_WIN_PATH/_classic_era_/Interface/AddOns"
# Do not backup Addons themselves, only config for now
#WOW_SUBDIR_BACKUP=("_classic_era_/Interface/AddOns" "_classic_era_/WTF")
WOW_SUBDIR_BACKUP=("_classic_era_/WTF")
OUTPUT_PATH="$HOME/gitrepo/wowaddons"

if [ ! -d "$WOW_WIN_PATH" ]; then
    echo "ERROR: $WOW_WIN_PATH does not exist"
    exit 1
fi

ARCHIVE_NAME="wow_backup_$(date +%d%m%Y)_$(date +%s)"
TMP_DST_DIR="$HOME/$ARCHIVE_NAME"
mkdir $TMP_DST_DIR
echo "Backing up to $TMP_DST_DIR"

for subdir in "${WOW_SUBDIR_BACKUP[@]}"
do
    echo "Copying $WOW_WIN_PATH/$subdir"
    cp -r "$WOW_WIN_PATH/$subdir" $TMP_DST_DIR
done

# Create list of addons
ls "$ADDON_WIN_PATH" >> $TMP_DST_DIR/addons.txt

cd $HOME
tar czf $OUTPUT_PATH/$ARCHIVE_NAME.tar.gz $ARCHIVE_NAME
echo "Created archive $OUTPUT_PATH/$ARCHIVE_NAME.tar.gz"

rm -rf $TMP_DST_DIR

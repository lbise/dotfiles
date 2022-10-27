#!/bin/env bash
USER="13lbise"
OPTS="-X"

INDEX_LIST=("ch03wx5vwltn3" "ch03wxjtwltn3" "ch03wx6xd2cf3" "ch03ww5027")
COMMENT_LIST=("PEVB #9 Leo" "PEVB Christophe" "EBOARD Alessandro" "UBOARD Standalone")

function print_help {
	echo "Usage: $0 [OPTION] INDEX [ARGS...]"
    echo ""
    echo "  INDEX:          Index to the machine you want to connect"
    echo ""
    echo "  OPTION:"
    echo "      -l/--list   List indexes"
    echo "      -c/--copy   SSH copy key to remote host before connection"
    echo ""
    echo "  ARGS:           Further arguments passed to ssh"
    echo ""
}

POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
  case $1 in
    -c|--copy)
    COPY_KEY=1
    shift # past argument
    ;;
    -l|--list)
    LIST_INDEX=1
    shift # past argument
    ;;
    -h|--help)
    print_help
    exit 1
    ;;
    -*|--*)
    echo "Unknown option $1"
    exit 1
    ;;
    *)
    POSITIONAL_ARGS+=("$1") # save positional arg
    shift # past argument
    ;;
esac
done

set -- "${POSITIONAL_ARGS[@]}" # restore positional parameters

if [ "$LIST_INDEX" = 1 ]; then
    CNT=0
    for i in ${INDEX_LIST[@]}; do
        echo "#$CNT $i: ${COMMENT_LIST[$CNT]}"
        CNT=$((CNT+1))
    done

    exit
fi

if [ -z "$1" ]; then
    echo "You must provide the machine index!"
    exit
fi

INDEX=$1
shift # consume argument

if [ "$INDEX" = 0 ]; then
    # pevb Leo Nb 9
    MACHINE="ch03wx5vwltn3"
elif [ "$INDEX" = 1 ]; then
    # pevb Christophe
    MACHINE="ch03wxjtwltn3"
elif [ "$INDEX" = 2 ]; then
    # Alessandro's old eboard
    MACHINE="ch03wx6xd2cf3"
elif [ "$INDEX" = 3 ]; then
    # uboard standalone
    MACHINE="ch03ww5027"
else
    echo "Invalid index!"
    exit
fi

MACHINE="${MACHINE}.corp.ads"

if [ "$COPY_KEY" = 1 ]; then
    echo "Copying key to $MACHINE"
    ssh-copy-id -f $USER@$MACHINE
fi

echo "Connecting to $MACHINE"
ssh $USER@$MACHINE $OPTS $@

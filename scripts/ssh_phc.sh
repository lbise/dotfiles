#!/bin/env bash
USER="13lbise"
OPTS="-X"

INDEX_LIST=("ch03wxjtwltn3" "ch03wxpevb09" "ch03wx6xd2cf3" "ch03ww5027")
COMMENT_LIST=("PEVB Leo" "PEVB #9 Christophe" "EBOARD Alessandro" "UBOARD Standalone")

function print_help {
	echo "Usage: $0 [OPTION] INDEX [ARGS...]"
    echo ""
    echo "  INDEX:          Index to the machine you want to connect"
    echo ""
    echo "  OPTION:"
    echo "      -l/--list   List indexes"
    echo "      -u/--user   User to use"
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
    -u|--user)
    shift # past argument
    USER="$1"
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

MACHINE=${INDEX_LIST[$INDEX]}
if [ "$MACHINE" == "" ]; then
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

#!/bin/env bash
USER="13lbise"
OPTS="-X"

function print_help {
	echo "Usage: $0 [OPTION] INDEX [ARGS...]"
    echo ""
    echo "  INDEX:          Index to the machine you want to connect"
    echo ""
    echo "  OPTION:"
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

if [ -z "$1" ]; then
    echo "You must provide the machine index!"
    exit
fi

INDEX=$1
shift # consume argument

if [ "$INDEX" = 0 ]; then
    MACHINE="ch03ww5027"
elif [ "$INDEX" = 1 ]; then
    MACHINE="ch03wx6xd2cf3"
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

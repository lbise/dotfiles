#!/bin/env bash
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
MACHINE_FILE="$SCRIPT_DIR/ssh_machines.txt"
USER="13lbise"
OPTS="-X -A"

INDEX_LIST=()
COMMENT_LIST=()

function print_help {
	echo "Usage: $0 [OPTION] INDEX [ARGS...]"
    echo ""
    echo "  INDEX:          Index to the machine you want to connect"
    echo ""
    echo "  OPTION:"
    echo "      -a/--addr   Specify machine address to connect"
    echo "      -l/--list   List indexes"
    echo "      -u/--user   User to use"
    echo "      -c/--copy   SSH copy key to remote host before connection"
    echo ""
    echo "  ARGS:           Further arguments passed to ssh"
    echo ""
}

while IFS= read -r LINE; do
    CNT=0
    while IFS=';' read -ra ADDR; do
        for i in "${ADDR[@]}"; do
            if [ $CNT = 0 ]; then
                MACHINE_NAME="$i"
            elif [ $CNT = 1 ]; then
                MACHINE_COMMENT="$i"
            fi
            CNT=$((CNT+1))
        done
    done <<< "$LINE"
    #echo "$MACHINE_NAME : $MACHINE_COMMENT"
    INDEX_LIST+=("$MACHINE_NAME")
    COMMENT_LIST+=("$MACHINE_COMMENT")
done < $MACHINE_FILE

POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
  case $1 in
    -a|--adr)
    shift # past argument
    ADDRESS=$1
    shift # past argument
    ;;
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

if [ "$ADDRESS" = ""  ] && [ -z "$1" ]; then
    echo "You must provide the machine index or name!"
    exit
fi

if [ "$ADDRESS" = "" ]; then
    INDEX=$1
    shift # consume argument
    MACHINE=${INDEX_LIST[$INDEX]}
    if [ "$MACHINE" == "" ]; then
        echo "Invalid index!"
        exit
    fi
else
    MACHINE=${ADDRESS}
fi

MACHINE="${MACHINE}.corp.ads"

if [ "$COPY_KEY" = 1 ]; then
    echo "Copying key to $MACHINE"
    ssh-copy-id -f $USER@$MACHINE
    ssh-copy-id -f -i ~/.ssh/13lbisex2go_id_rsa $USER@$MACHINE
fi

echo "Connecting to $MACHINE with args $OPTS $@"
ssh $USER@$MACHINE $OPTS $@

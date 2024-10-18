#!/bin/env bash


function print_help {
	echo "Usage: $0 [OPTION] ROOT_PATH"
    echo ""
    echo "  ROOT_PATH:          Path to start running clang from"
    echo ""
    echo "  OPTION:"
    echo "      -R/--recurse   Perform operation recursively"
    echo ""
    echo "  ARGS:           Further arguments passed to clang-format"
    echo ""
}

# Parse arguments
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
  case $1 in
    -R|--recurse)
    shift # past argument
    RECURSE=1
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

ROOT_PATH="$1"
if [ "$ROOT_PATH" = "" ]; then
    echo "You must provide a path"
    exit 1
fi

if [ ! -d "$ROOT_PATH" ]; then
  echo "$ROOT_PATH does not exist."
  exit 1
fi

if ! command -v clang-format 2>&1 >/dev/null
then
    echo "clang-format could not be found"
    exit 1
fi

DEFAULT_CONFIG="$HOME/.clang-format"
find $ROOT_PATH -iname '*.h' -o -iname '*.c' | xargs clang-format -i --style=file:$DEFAULT_CONFIG

#!/bin/bash

## Check if at least two arguments are provided
#if [ "$#" -lt 2 ]; then
#    echo "Usage: $0 <function_name> <path1> [path2 ...]"
#    exit 1
#fi
#
#FUNCTION_NAME="$1"
#
## Shift to process the remaining paths
#shift


function print_help {
	echo "Usage: $0 [OPTION] PATH..."
    echo ""
    echo "  PATH:                   Path to search in"
    echo ""
    echo "  OPTION:"
    echo "      -r/--remove FUNC    Remove functions"
    echo "      -l/--list-empty     List empty functions"
    echo ""
}

# Function to find all empty functions in a directory recursively
find_empty_functions() {
    local dir="$1"

    # Use grep and sed to find and extract functions with empty bodies
    grep -Prn --include="*.c" --include="*.h" \
        -e '^[a-zA-Z_][a-zA-Z0-9_ \*\t]*\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)\s*\{' \
        "$dir" | while IFS=: read -r file line content; do
        # Extract the body of the function
        body=$(sed -n "${line},/}/p" "$file" | tail -n +2 | head -n -1)

        # Check if the body contains only whitespace or comments
        if [[ -z $(echo "$body" | grep -Pv '^\s*(//|/\*|\*/|\*|\s*)$') ]]; then
            echo "$file:$line: $content"
        fi
    done
}

LIST_EMPTY=0
FUNCTION_NAME=""
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
  case $1 in
    -r|--remove)
    shift # past argument
    FUNCTION_NAME="$1"
    ;;
    -l|--list-empty)
    shift # past argument
    LIST_EMPTY=1
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

echo "at: $@"


#if [ ! $LIST_EMPTY = 1 ]; then
#    # Remove function
#    # Consume first positional arg as function name
#    FUNCTION_NAME="$1"
#    shift
#fi
#
#
#echo "at: $@"

# Loop over all provided paths
for SEARCH_PATH in "$@"; do
    echo "Processing path: $SEARCH_PATH"

    # Ensure the specified path exists
    if [ ! -d "$SEARCH_PATH" ]; then
        echo "Error: Path '$SEARCH_PATH' does not exist or is not a directory."
        continue
    fi

    if [ $LIST_EMPTY = 1 ]; then
        find_empty_functions "$SEARCH_PATH"
        continue
    fi

    if [ $FUNCTION_NAME = "" ]; then
        echo "No function name provided!"
        exit 1
    fi

    echo "Removing: $FUNCTION_NAME"

    # Find and process all .c files recursively in the provided path
    find "$SEARCH_PATH" -iname "*.c" -o -iname "*.h" -type f | while read -r file; do
        # Remove function declarations (e.g., void func(int arg);)
        sed -i -E "/\b$FUNCTION_NAME\s*\([^)]*\)\s*;/d" "$file"

        # Remove all function calls, handling nested parentheses using perl
        perl -i -pe "s/\b$FUNCTION_NAME\s*\((?:[^)(]*|\((?:[^)(]*|\([^)(]*\))*\))*\);//g" "$file"

        # Remove single-line function definitions, e.g., void func() {}
        sed -i -E "/\b$FUNCTION_NAME\s*\([^)]*\)\s*\{\s*\}/d" "$file"

        # Remove multi-line function definitions, from function signature to closing brace
        sed -i -E "/\b$FUNCTION_NAME\s*\([^)]*\)\s*\{/,/^\}/d" "$file"

        echo "Processed $file"
    done
done

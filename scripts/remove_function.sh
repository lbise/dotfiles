#!/bin/bash

# Check if at least two arguments are provided
if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <function_name> <path1> [path2 ...]"
    exit 1
fi

FUNCTION_NAME="$1"

# Shift to process the remaining paths
shift

# Loop over all provided paths
for SEARCH_PATH in "$@"; do
    # Ensure the specified path exists
    if [ ! -d "$SEARCH_PATH" ]; then
        echo "Error: Path '$SEARCH_PATH' does not exist or is not a directory."
        continue
    fi

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

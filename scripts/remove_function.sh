#!/bin/bash
# Thanks chatgpt
# Check if the function name and at least one path is provided
if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <function_name> <path1> [<path2> ...]"
    exit 1
fi

FUNCTION_NAME="$1"
shift  # Shift arguments to skip the first one (function name)

# Process each path provided as an argument
for SEARCH_PATH in "$@"; do
    # Ensure the specified path exists
    if [ ! -d "$SEARCH_PATH" ]; then
        echo "Error: Path '$SEARCH_PATH' does not exist or is not a directory."
        continue  # Skip to the next path if this one is invalid
    fi

    # Find and process all .c files recursively in the current path
    find "$SEARCH_PATH" -name "*.c" -type f | while read -r file; do
        # Remove all function calls (assuming they end with a semicolon)
        sed -i -E "s/\b$FUNCTION_NAME\([^()]*\);//g" "$file"

        # Remove single-line function definitions, e.g., void func() {}
        sed -i -E "/\b$FUNCTION_NAME\s*\([^)]*\)\s*\{\s*\}/d" "$file"

        # Remove multi-line function definitions, from function signature to closing brace
        sed -i -E "/\b$FUNCTION_NAME\s*\([^)]*\)\s*\{/,/^\}/d" "$file"

        echo "Processed $file in $SEARCH_PATH"
    done
done

#!/usr/bin/env bash

set -u

readonly ICON="󰐪"

json_escape() {
    local value=$1

    value=${value//\\/\\\\}
    value=${value//\"/\\\"}
    value=${value//$'\n'/\\n}
    value=${value//$'\r'/\\r}
    value=${value//$'\t'/\\t}

    printf '%s' "$value"
}

emit_status() {
    local text=$1
    local tooltip=$2
    local class=$3

    printf '{"text":"%s","tooltip":"%s","class":"%s"}\n' \
        "$(json_escape "$text")" \
        "$(json_escape "$tooltip")" \
        "$(json_escape "$class")"
}

if ! command -v lpstat >/dev/null 2>&1; then
    emit_status "$ICON" "Printer status unavailable: lpstat is not installed" "unavailable"
    exit 0
fi

if ! printer_status=$(lpstat -p 2>&1); then
    emit_status "$ICON" "Printer status unavailable"$'\n'"$printer_status" "unavailable"
    exit 0
fi

if [[ -z $printer_status ]]; then
    emit_status "$ICON" "No printer configured" "unavailable"
    exit 0
fi

if ! queue=$(lpstat -W not-completed -o 2>&1); then
    emit_status "$ICON" "Could not read the print queue"$'\n'"$queue" "unavailable"
    exit 0
fi

job_count=0
queue_details=""
while read -r job owner _; do
    [[ -z ${job:-} ]] && continue

    ((job_count += 1))
    queue_details+=$'\n'
    queue_details+="${job} — ${owner:-unknown user}"
done <<< "$queue"

if ((job_count == 0)); then
    emit_status "$ICON" "Print queue is empty"$'\n'"$printer_status" "idle"
    exit 0
fi

job_label="jobs"
((job_count == 1)) && job_label="job"
emit_status "$ICON $job_count" "$job_count $job_label in the print queue${queue_details}"$'\n'"$printer_status" "printing"

#!/usr/bin/env bash

# Enumerate only descendants of a known root PID. Children are emitted
# post-order so the deepest runtime process is preferred over CLI wrappers.
dial_proc_descendants_postorder() {
  local parent="$1" child children_file="/proc/$1/task/$1/children"
  [[ "$parent" =~ ^[1-9][0-9]*$ ]] || return 0
  [[ -r "$children_file" ]] || return 0
  for child in $(cat "$children_file" 2>/dev/null || true); do
    [[ "$child" =~ ^[1-9][0-9]*$ ]] || continue
    dial_proc_descendants_postorder "$child"
    printf '%s\n' "$child"
  done
}

dial_proc_has_codex_app_server_argv() {
  local pid="$1" i
  local -a argv=()
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
  [[ -r "/proc/$pid/cmdline" ]] || return 1
  mapfile -d '' -t argv <"/proc/$pid/cmdline" 2>/dev/null || return 1
  (( ${#argv[@]} >= 2 )) || return 1
  for (( i=0; i+1<${#argv[@]}; i++ )); do
    if [[ "${argv[$i]##*/}" == "codex" && "${argv[$((i+1))]}" == "app-server" ]]; then
      return 0
    fi
  done
  return 1
}

dial_find_probe_owned_codex_app_server() {
  local root="$1" pid exe fallback=""
  while IFS= read -r pid; do
    [[ "$pid" =~ ^[1-9][0-9]*$ ]] || continue
    dial_proc_has_codex_app_server_argv "$pid" || continue
    exe="$(readlink -f "/proc/$pid/exe" 2>/dev/null || true)"
    if [[ "${exe##*/}" == "codex" ]]; then
      printf '%s\n' "$pid"
      return 0
    fi
    [[ -n "$fallback" ]] || fallback="$pid"
  done < <(dial_proc_descendants_postorder "$root")
  [[ -n "$fallback" ]] || return 1
  printf '%s\n' "$fallback"
}

#!/usr/bin/env bash
# Render cloud-init.yaml.tmpl into a launch-ready user-data document.
#
#   ./render-cloud-init.sh > cloud-init.yaml
#
# Inlines bootstrap.sh at @@BOOTSTRAP@@ (indented into the write_files block) and
# substitutes the authorized SSH public key at @@SSH_PUBLIC_KEY@@. Keeping the
# bootstrap in its own file means it stays lintable and can be re-run by hand on
# the host; rendering keeps cloud-init a single self-contained document.
#
# The public key is not a secret and is the one already authorized for this estate;
# the matching private key is never read, written, printed or transported by any
# script in this directory.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

KEY_FILE="${DIAL_SSH_PUBLIC_KEY_FILE:-authorized_key.pub}"
[[ -f $KEY_FILE ]] || { echo "missing public key file: $KEY_FILE" >&2; exit 1; }
KEY="$(tr -d '\n' < "$KEY_FILE")"
[[ $KEY == ssh-* ]] || { echo "$KEY_FILE does not look like an OpenSSH public key" >&2; exit 1; }
case "$KEY" in
  *PRIVATE*) echo "REFUSED: $KEY_FILE contains private key material" >&2; exit 1 ;;
esac

bash -n bootstrap.sh || { echo "bootstrap.sh failed syntax check; refusing to render" >&2; exit 1; }

# Substitution is done with bash string operations and sed's `r`, never with
# `awk -v`: awk interprets backslash escapes in a -v assignment, which silently
# rewrites every `\n` in bootstrap.sh's printf formats into a real newline and
# destroys the block-scalar indentation. The rendered YAML then fails to parse.
#
# The marker is matched only as a whole line, so prose mentioning it cannot splice
# the script outside its block scalar.
render() {
  local line
  while IFS= read -r line || [[ -n $line ]]; do
    if [[ $line =~ ^[[:space:]]*@@BOOTSTRAP@@[[:space:]]*$ ]]; then
      # 6 spaces: the `content: |` block inside write_files.
      sed 's/^/      /' bootstrap.sh
      continue
    fi
    printf '%s\n' "${line//@@SSH_PUBLIC_KEY@@/$KEY}"
  done < cloud-init.yaml.tmpl
}

rendered="$(render)"

# Refuse to emit a document with an unsubstituted placeholder.
if grep -q '@@[A-Z_]*@@' <<<"$rendered"; then
  echo "unsubstituted placeholder remains after rendering:" >&2
  grep -n '@@[A-Z_]*@@' <<<"$rendered" >&2
  exit 1
fi

printf '%s\n' "$rendered"

# cloud-init user-data has a 16 KB limit before base64/gzip on some paths; the
# launch script gzips, so this is a soft warning rather than a failure.

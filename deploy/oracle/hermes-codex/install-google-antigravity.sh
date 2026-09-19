#!/usr/bin/env bash
set -euo pipefail

VERSION="1.2.0"
BASE_URL="https://github.com/google-antigravity/antigravity-cli/releases/download/${VERSION}"
INSTALL_DIR="${DIAL_ANTIGRAVITY_INSTALL_DIR:-${HOME}/.local/bin}"

case "$(uname -m)" in
  aarch64|arm64)
    ASSET="agy_cli_linux_arm64.tar.gz"
    EXPECTED_SHA256="0a8e61f6548865029c4238b9310c686b7a733db5864cae619656abdf48090594"
    ;;
  x86_64|amd64)
    ASSET="agy_cli_linux_x64.tar.gz"
    EXPECTED_SHA256="d9bfee1ae6e4329562cb87da1f5fc3c886d18594837e73e25c3aae00a49499b9"
    ;;
  *)
    echo "Unsupported Antigravity CLI architecture: $(uname -m)" >&2
    exit 2
    ;;
esac

for command in curl sha256sum tar find install; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 3; }
done
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
archive="$tmp/$ASSET"

curl --fail --show-error --location --proto '=https' --tlsv1.2 \
  "$BASE_URL/$ASSET" -o "$archive"
if ! printf '%s  %s\n' "$EXPECTED_SHA256" "$archive" | sha256sum -c - >/dev/null; then
  echo "Antigravity CLI digest mismatch for $ASSET" >&2
  exit 4
fi

mkdir -p "$tmp/extracted"
tar --extract --gzip --file "$archive" --directory "$tmp/extracted" \
  --no-same-owner --no-same-permissions
mapfile -t candidates < <(find "$tmp/extracted" -type f \( -name antigravity -o -name agy \) -print)
[[ ${#candidates[@]} -eq 1 ]] || { echo "Expected exactly one Antigravity CLI binary in release asset" >&2; exit 5; }

mkdir -p "$INSTALL_DIR"
install -m 0755 "${candidates[0]}" "$INSTALL_DIR/antigravity.real"
cat > "$INSTALL_DIR/agy" <<'WRAP'
#!/usr/bin/env bash
set -euo pipefail
RUNTIME_HOME="${DIAL_ANTIGRAVITY_HOME:-${DIAL_CONTROL_HOME:-/var/lib/dial-control}/identities/antigravity-worker}"
mkdir -p "$RUNTIME_HOME" "$RUNTIME_HOME/.config" "$RUNTIME_HOME/.cache" "$RUNTIME_HOME/.local/share"
chmod 700 "$RUNTIME_HOME" "$RUNTIME_HOME/.config" "$RUNTIME_HOME/.cache" "$RUNTIME_HOME/.local" "$RUNTIME_HOME/.local/share" 2>/dev/null || true
export HOME="$RUNTIME_HOME"
export XDG_CONFIG_HOME="$RUNTIME_HOME/.config"
export XDG_CACHE_HOME="$RUNTIME_HOME/.cache"
export XDG_DATA_HOME="$RUNTIME_HOME/.local/share"
export AGY_CLI_DISABLE_AUTO_UPDATE=true
unset GOOGLE_API_KEY GEMINI_API_KEY GOOGLE_APPLICATION_CREDENTIALS CLOUDSDK_CONFIG GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_PROJECT_ID
exec "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/antigravity.real" "$@"
WRAP
chmod 0755 "$INSTALL_DIR/agy"
cp "$INSTALL_DIR/agy" "$INSTALL_DIR/antigravity"
reported="$($INSTALL_DIR/agy --version 2>/dev/null | awk '{print $NF}' | tail -1)"
if [[ "$reported" != "$VERSION" ]]; then
  echo "Antigravity CLI version mismatch: expected $VERSION, got ${reported:-unknown}" >&2
  exit 6
fi

printf 'Installed Google Antigravity CLI %s at %s with deterministic auto-update-disabled wrappers %s and %s\n' "$VERSION" "$INSTALL_DIR/antigravity.real" "$INSTALL_DIR/antigravity" "$INSTALL_DIR/agy"
printf 'Authentication is intentionally isolated at %s. Run agy on the target host and complete the supported Google sign-in flow for the dedicated Antigravity worker identity.\n' "${DIAL_ANTIGRAVITY_HOME:-${DIAL_CONTROL_HOME:-/var/lib/dial-control}/identities/antigravity-worker}"

#!/usr/bin/env bash
set -euo pipefail
umask 077

NODE_VERSION="22.23.3"
case "$(uname -m)" in
  aarch64|arm64)
    NODE_ARCH="arm64"
    NODE_SHA256="a44aeb94849a299b22df10b9e622ec2f605c2183501bc40590705131de7c740f"
    ;;
  x86_64|amd64)
    NODE_ARCH="x64"
    NODE_SHA256="df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de"
    ;;
  *) echo "ERROR: unsupported Node architecture $(uname -m)" >&2; exit 2 ;;
esac

for command_name in curl sha256sum tar; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "ERROR: $command_name is required for pinned Node bootstrap" >&2; exit 1; }
done
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
NODE_ARCHIVE="$(mktemp "/tmp/dial-node-${NODE_VERSION}-${NODE_ARCH}.XXXXXX.tar.xz")"
trap 'rm -f "$NODE_ARCHIVE"' EXIT
curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --output "$NODE_ARCHIVE" "$NODE_URL"
printf '%s  %s\n' "$NODE_SHA256" "$NODE_ARCHIVE" | sha256sum --check --status || {
  echo "ERROR: official Node release SHA-256 mismatch" >&2
  exit 1
}
NODE_PREFIX="$HOME/.local/lib/node-v${NODE_VERSION}"
mkdir -p "$NODE_PREFIX" "$HOME/.local/bin"
tar -xJf "$NODE_ARCHIVE" --strip-components=1 -C "$NODE_PREFIX"
for binary in node npm npx corepack; do
  [[ -e "$NODE_PREFIX/bin/$binary" ]] && ln -sfn "$NODE_PREFIX/bin/$binary" "$HOME/.local/bin/$binary"
done
"$HOME/.local/bin/node" --version | grep -Fx "v${NODE_VERSION}" >/dev/null
echo "Pinned Node v${NODE_VERSION} installed from the official ${NODE_ARCH} release tarball."

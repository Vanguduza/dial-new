#!/usr/bin/env bash
set -euo pipefail
umask 077

NODE_VERSION="22.23.2"
case "$(uname -m)" in
  aarch64|arm64)
    NODE_ARCH="arm64"
    NODE_SHA256="fff4078c5def658577f92c88db7db3bc0072924bfb93fe52c1e744a54e94abb8"
    ;;
  x86_64|amd64)
    NODE_ARCH="x64"
    NODE_SHA256="d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307"
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

#!/usr/bin/env bash
set -euo pipefail
PREFIX="${DIAL_COMMANDER_PREFIX:-/opt/dial-recovery/commander}"
PKG="$PREFIX/node_modules/@wonderwhy-er/desktop-commander/package.json"
TARGET="$PREFIX/node_modules/@wonderwhy-er/desktop-commander/dist/remote-device/device.js"
EXPECTED_VERSION="0.2.50"
[[ -r "$PKG" && -r "$TARGET" ]] || { echo "COMMANDER_SESSION_PERSISTENCE=ERROR missing installed package" >&2; exit 2; }
VERSION="$(node -e 'const p=require(process.argv[1]); process.stdout.write(String(p.version||""))' "$PKG")"
[[ "$VERSION" == "$EXPECTED_VERSION" ]] || { echo "COMMANDER_SESSION_PERSISTENCE=ERROR expected $EXPECTED_VERSION got ${VERSION:-unknown}" >&2; exit 2; }
if grep -q "DIAL hotfix for Desktop Commander 0.2.50" "$TARGET"; then
  echo "COMMANDER_SESSION_PERSISTENCE=ALREADY_PATCHED version=$VERSION"
  exit 0
fi
BACKUP="${TARGET}.dial-pre-session-persistence"
[[ -e "$BACKUP" ]] || cp -p "$TARGET" "$BACKUP"
python3 - "$TARGET" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
repls=[
("        this.isShuttingDown = false;\n        this.configPath = getRemoteDeviceConfigPath();",
 "        this.isShuttingDown = false;\n        // DIAL hotfix for Desktop Commander 0.2.50:\n        // persist rotated refresh tokens so a supervised restart can recover headlessly.\n        this.sessionPersistenceInterval = null;\n        this.configPath = getRemoteDeviceConfigPath();"),
("            this.remoteChannel.startHeartbeat(this.deviceId);\n        }",
 "            this.remoteChannel.startHeartbeat(this.deviceId);\n            this.startSessionPersistence();\n        }"),
("    async findPersistedDeviceWithRetry(deviceId) {",
 "    startSessionPersistence() {\n        if (!this.persistSession || this.sessionPersistenceInterval)\n            return;\n        const persistFreshSession = async () => {\n            try {\n                const currentSessionStore = await this.remoteChannel.getSession();\n                const session = currentSessionStore?.data?.session;\n                if (!session?.refresh_token)\n                    return;\n                await this.savePersistedConfig();\n            }\n            catch (error) {\n                console.warn('Periodic session persistence failed:', error?.message ?? error);\n            }\n        };\n        this.sessionPersistenceInterval = setInterval(() => {\n            void persistFreshSession();\n        }, 300000);\n        this.sessionPersistenceInterval.unref?.();\n    }\n    async findPersistedDeviceWithRetry(deviceId) {"),
("        this.isShuttingDown = true;\n        console.log('\\n🛑 Shutting down device...');",
 "        this.isShuttingDown = true;\n        if (this.sessionPersistenceInterval) {\n            clearInterval(this.sessionPersistenceInterval);\n            this.sessionPersistenceInterval = null;\n        }\n        console.log('\\n🛑 Shutting down device...');")
]
for old,new in repls:
    if old not in s:
        raise SystemExit(f"required upstream anchor missing: {old[:80]!r}")
    s=s.replace(old,new,1)
p.write_text(s)
PY
grep -q "DIAL hotfix for Desktop Commander 0.2.50" "$TARGET"
grep -q "startSessionPersistence()" "$TARGET"
node --check "$TARGET"
echo "COMMANDER_SESSION_PERSISTENCE=PATCHED version=$VERSION backup=$BACKUP"

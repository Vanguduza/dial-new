#!/usr/bin/env python3
"""Apply DIAL's mandatory ARTEMIS shell-boundary hardening to the pinned upstream tree.

Fails closed if upstream source differs from the reviewed commit/snippets.
"""
from __future__ import annotations

import pathlib
import subprocess
import sys

PINNED_COMMIT = "371aa6df56880643da57b30da936e9812fb0ec66"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f"REFUSE: expected exactly one {label} sink, found {text.count(old)}")
    return text.replace(old, new, 1)


def main() -> int:
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    observed = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    if observed != PINNED_COMMIT:
        raise SystemExit(f"REFUSE: ARTEMIS commit {observed} != reviewed {PINNED_COMMIT}")

    adb = root / "artemis/drivers/android/adb_driver.py"
    ctrl = root / "artemis/controllers/unified_controller.py"
    adb_text = adb.read_text()
    ctrl_text = ctrl.read_text()

    if "DIAL_ARTEMIS_SHELL_HARDENING_V1" in adb_text and "DIAL_ARTEMIS_SHELL_HARDENING_V1" in ctrl_text:
        print("ARTEMIS_HARDENING=ALREADY_APPLIED")
        return 0

    adb_text = replace_once(adb_text, "import base64\n", "import base64\nimport re\n", "adb import")
    adb_text = replace_once(
        adb_text,
        'logger = get_logger(__name__)\n',
        'logger = get_logger(__name__)\n\n'
        '# DIAL_ARTEMIS_SHELL_HARDENING_V1\n'
        '_ANDROID_PACKAGE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$")\n\n'
        'def _validated_package_name(value: str) -> str:\n'
        '    package = str(value or "").strip()\n'
        '    if not _ANDROID_PACKAGE_RE.fullmatch(package):\n'
        '        raise ValueError(f"invalid Android package name: {value!r}")\n'
        '    return package\n',
        "adb logger marker",
    )
    adb_text = replace_once(
        adb_text,
        '    async def launch_app(self, package_name: str) -> bool:\n'
        '        try:\n'
        '            cmd = f"monkey -p {package_name} -c android.intent.category.LAUNCHER 1"\n',
        '    async def launch_app(self, package_name: str) -> bool:\n'
        '        try:\n'
        '            package_name = _validated_package_name(package_name)\n'
        '            cmd = f"monkey -p {package_name} -c android.intent.category.LAUNCHER 1"\n',
        "launch_app",
    )
    adb_text = replace_once(
        adb_text,
        '    async def stop_app(self, package_name: str) -> bool:\n'
        '        try:\n'
        '            await asyncio.to_thread(self.device.shell, f"am force-stop {package_name}")\n',
        '    async def stop_app(self, package_name: str) -> bool:\n'
        '        try:\n'
        '            package_name = _validated_package_name(package_name)\n'
        '            await asyncio.to_thread(self.device.shell, f"am force-stop {package_name}")\n',
        "stop_app",
    )

    ctrl_text = replace_once(ctrl_text, "import os\n", "import os\nimport shlex\n", "controller import")
    ctrl_text = replace_once(
        ctrl_text,
        '    async def open_url(self, url: str) -> bool:\n'
        '        await self._driver.execute_shell(f"am start -a android.intent.action.VIEW -d \'{url}\'")\n'
        '        return True\n',
        '    async def open_url(self, url: str) -> bool:\n'
        '        # DIAL_ARTEMIS_SHELL_HARDENING_V1: shell-quote the complete URL argument.\n'
        '        safe_url = shlex.quote(str(url))\n'
        '        await self._driver.execute_shell(f"am start -a android.intent.action.VIEW -d {safe_url}")\n'
        '        return True\n',
        "open_url",
    )

    adb.write_text(adb_text)
    ctrl.write_text(ctrl_text)

    if "am force-stop {package_name}" not in adb_text or "_validated_package_name(package_name)" not in adb_text:
        raise SystemExit("REFUSE: package hardening verification failed")
    if "shlex.quote(str(url))" not in ctrl_text:
        raise SystemExit("REFUSE: URL hardening verification failed")
    print("ARTEMIS_HARDENING=APPLIED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

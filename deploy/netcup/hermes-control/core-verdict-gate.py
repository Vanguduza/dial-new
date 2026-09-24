#!/usr/bin/env python3
"""Decide whether a Netcup CORE_DEVELOPMENT verification report may proceed.

  core-verdict-gate.py <verification.json> <BLOCK_LABEL>

Shared by the migration cutover and by activation so both apply one rule
(auth-20260924-owner-reconcile-cutover-gates, auth-20260924-owner-cutover-external-gates):

- GREEN proceeds.
- AMBER proceeds only when nothing in CORE_DEVELOPMENT failed, nothing required is uncovered, and every
  open item carries the Netcup activation hold or a named external or owner-auth gate (EXTERNAL-GATE-*,
  AUTH-GATE-*). Those are tracked owner work, not host failures; certification still reports them.
- Anything else exits non-zero with "<BLOCK_LABEL>: ..." naming what failed.
"""
import json
import sys


def gated(gate):
    gate = gate or ""
    return gate == "NETCUP-ACTIVATION-GATE" or gate.startswith("EXTERNAL-GATE-") or gate.startswith("AUTH-GATE-")


def main(path, label):
    try:
        d = json.load(open(path))
    except Exception as e:
        raise SystemExit(f"{label}: unreadable Netcup verification: {e}")
    status = d.get("overall_status") or d.get("status") or d.get("verdict")
    if status in ("GREEN", "PASS", "VERIFIED_SUCCESS"):
        print("NETCUP_CORE_DEVELOPMENT=GREEN")
        return
    core = (d.get("readiness_profiles") or {}).get("CORE_DEVELOPMENT") or {}
    gates = {c.get("id"): c.get("gate") or "" for c in d.get("checks") or []}
    open_items = core.get("open") or []
    held = [i for i in open_items if gated(gates.get(i))]
    if not (status == "AMBER" and core.get("status") == "AMBER" and not core.get("failed")
            and not core.get("uncovered") and open_items and held == open_items):
        raise SystemExit(f"{label}: Netcup CORE_DEVELOPMENT is not green: {status}"
                         + " failed=" + ",".join(core.get("failed") or [])
                         + " uncovered=" + ",".join(core.get("uncovered") or [])
                         + " open_not_held=" + ",".join(i for i in open_items if i not in held))
    print("NETCUP_CORE_DEVELOPMENT=GREEN_EXCEPT_GATED held=" + ",".join(f"{i}@{gates[i]}" for i in held))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: core-verdict-gate.py <verification.json> <BLOCK_LABEL>")
    main(sys.argv[1], sys.argv[2])

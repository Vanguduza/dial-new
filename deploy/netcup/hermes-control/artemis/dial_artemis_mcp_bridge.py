#!/usr/bin/env python3
"""Hermes-only bridge to the pinned ARTEMIS native MCP server.

This is intentionally not a general MCP proxy. Hermes validates admission and
scope in Node first, and this process has a second allowlist so no upstream tool
can be reached accidentally through the DIAL control plane.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import traceback
from typing import Any

ALLOWED = {
    "mobile_run_task",
    "mobile_manage_task",
    "mobile_get_device_state",
    "mobile_inspect_trace",
    "mobile_diagnose",
}


def _jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if hasattr(value, "model_dump"):
        return _jsonable(value.model_dump(mode="json"))
    return str(value)


async def _call(tool: str, root: str, payload: dict[str, Any]) -> Any:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    os.chdir(root)
    env = dict(os.environ)
    env["ARTEMIS_STANDALONE"] = "1"
    env["ARTEMIS_TASK_INGRESS"] = "dial-hermes-subordinate"
    env["DIAL_ARTEMIS_SUBORDINATE"] = "1"
    env["PYTHONPATH"] = root + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    server = StdioServerParameters(command=sys.executable, args=["-m", "mcp_server"], env=env)
    async with stdio_client(server) as streams:
        read_stream, write_stream = streams
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            result = await session.call_tool(tool, payload)

    if getattr(result, "isError", False):
        parts = []
        for item in getattr(result, "content", []) or []:
            text = getattr(item, "text", None)
            if text:
                parts.append(text)
        raise RuntimeError("; ".join(parts) or f"ARTEMIS tool failed: {tool}")

    structured = getattr(result, "structuredContent", None)
    if structured is None:
        structured = getattr(result, "structured_content", None)
    if structured is not None:
        return _jsonable(structured)
    content = getattr(result, "content", []) or []
    if len(content) == 1 and getattr(content[0], "text", None) is not None:
        text = content[0].text
        try:
            return json.loads(text)
        except (TypeError, ValueError):
            return text
    return _jsonable(content)


def main() -> int:
    if len(sys.argv) != 3:
        print(json.dumps({"ok": False, "error": "usage: bridge TOOL ARTEMIS_ROOT"}))
        return 2
    tool, root = sys.argv[1:3]
    if tool not in ALLOWED:
        print(json.dumps({"ok": False, "error": f"tool not allowlisted: {tool}"}))
        return 2
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise ValueError("tool payload must be an object")
        result = asyncio.run(_call(tool, os.path.abspath(root), payload))
        print(json.dumps({"ok": True, "result": result}, separators=(",", ":")))
        return 0
    except Exception as exc:
        message = str(exc).replace("\n", " ")[:4000]
        if os.environ.get("DIAL_ARTEMIS_BRIDGE_DEBUG") == "1":
            message += " | " + traceback.format_exc(limit=3).replace("\n", " ")[:4000]
        print(json.dumps({"ok": False, "error": message}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/bin/bash
# Live, human-readable tail of a Claude Code session JSONL transcript.
# Usage: /tmp/tail-runner.sh <path-to-session.jsonl>

SESSION="${1:?usage: $0 <session.jsonl>}"

tail -F "$SESSION" | python3 -u -c '
import sys, json

def s(x, n=160):
    return (str(x)[:n]).replace("\n", " ⏎ ")

for line in sys.stdin:
    try:
        e = json.loads(line)
    except Exception:
        continue
    t = e.get("type")
    if t == "assistant":
        for it in e.get("message", {}).get("content", []) or []:
            kind = it.get("type")
            if kind == "tool_use":
                name = it.get("name", "")
                inp = it.get("input", {}) or {}
                arg = inp.get("command") or inp.get("file_path") or inp.get("description") or inp.get("prompt", "") or ""
                print(f"→ {name}: {s(arg)}")
            elif kind == "text":
                txt = it.get("text", "")
                if txt.strip():
                    print(f"💬 {s(txt)}")
    elif t == "user":
        for it in e.get("message", {}).get("content", []) or []:
            if it.get("type") == "tool_result":
                out = it.get("content", "")
                if isinstance(out, list):
                    out = out[0].get("text", "") if out else ""
                print(f"  ← {s(out, 140)}")
'

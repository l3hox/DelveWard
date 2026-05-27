#!/usr/bin/env python3
"""Post-hoc stats for an autonomous-runner session transcript.

Reads the JSONL produced by a Claude Code session, emits structured
statistics: main-session token usage (input/cache-create/cache-read/output),
tool-call distribution, per-subagent breakdown (tokens / tool_uses / duration
parsed from <usage> trailers), totals by subagent type, and a grand-total
cost estimate at Sonnet 4.6 rates.

Usage:
    run-stats.py <session.jsonl>

Output is structured plain text suitable for inclusion in a LOG/SUMMARY.md
or for direct piping to less / a shell summary.
"""
import sys
import json
import re
from collections import Counter, defaultdict
from datetime import datetime

# Sonnet 4.6 published rates (approximate)
RATE_INPUT        = 3.00  / 1_000_000
RATE_CACHE_CREATE = 3.75  / 1_000_000
RATE_CACHE_READ   = 0.30  / 1_000_000
RATE_OUTPUT       = 15.00 / 1_000_000

USAGE_RE = re.compile(
    r"<usage>\s*total_tokens:\s*(\d+)\s*tool_uses:\s*(\d+)\s*duration_ms:\s*(\d+)\s*</usage>",
    re.S,
)


def load_events(path):
    events = []
    with open(path) as f:
        for line in f:
            try:
                events.append(json.loads(line))
            except Exception:
                continue
    return events


def main():
    if len(sys.argv) < 2:
        print("usage: run-stats.py <session.jsonl>", file=sys.stderr)
        sys.exit(2)
    path = sys.argv[1]
    events = load_events(path)

    # Main-session token usage from assistant.message.usage
    main = {
        "input_tokens": 0,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0,
        "output_tokens": 0,
        "turns": 0,
    }
    for e in events:
        if e.get("type") != "assistant":
            continue
        usage = (e.get("message", {}) or {}).get("usage", {}) or {}
        if not usage:
            continue
        main["turns"] += 1
        for k in (
            "input_tokens",
            "cache_read_input_tokens",
            "cache_creation_input_tokens",
            "output_tokens",
        ):
            v = usage.get(k)
            if isinstance(v, int):
                main[k] += v
    main["total"] = sum(main[k] for k in (
        "input_tokens",
        "cache_read_input_tokens",
        "cache_creation_input_tokens",
        "output_tokens",
    ))
    main_cost = (
        main["input_tokens"] * RATE_INPUT
        + main["cache_creation_input_tokens"] * RATE_CACHE_CREATE
        + main["cache_read_input_tokens"] * RATE_CACHE_READ
        + main["output_tokens"] * RATE_OUTPUT
    )

    # Tool-call inventory
    tool_call_index = {}
    for e in events:
        if e.get("type") != "assistant":
            continue
        content = (e.get("message", {}) or {}).get("content", []) or []
        if not isinstance(content, list):
            continue
        for it in content:
            if not isinstance(it, dict):
                continue
            if it.get("type") == "tool_use":
                tool_call_index[it.get("id")] = {
                    "name": it.get("name"),
                    "input": it.get("input", {}) or {},
                    "ts": e.get("timestamp"),
                }

    # Tool results matched by tool_use_id
    tool_results_by_id = {}
    for e in events:
        if e.get("type") != "user":
            continue
        content = (e.get("message", {}) or {}).get("content", []) or []
        if not isinstance(content, list):
            continue
        for it in content:
            if not isinstance(it, dict):
                continue
            if it.get("type") == "tool_result":
                out = it.get("content", "")
                if isinstance(out, list):
                    pieces = [
                        piece.get("text", "")
                        for piece in out
                        if isinstance(piece, dict) and piece.get("type") == "text"
                    ]
                    out = "\n".join(pieces)
                tool_results_by_id[it.get("tool_use_id")] = out or ""

    tool_counts = Counter(c["name"] for c in tool_call_index.values())

    # Subagent records (Agent tool calls + their <usage> trailers)
    subagents = []
    for tid, call in tool_call_index.items():
        if call["name"] != "Agent":
            continue
        result = tool_results_by_id.get(tid, "")
        m = USAGE_RE.search(result)
        subagents.append({
            "ts": call["ts"],
            "subagent_type": call["input"].get("subagent_type", "?"),
            "name": call["input"].get("name") or call["input"].get("description") or "-",
            "team": call["input"].get("team_name") or "-",
            "tokens": int(m.group(1)) if m else 0,
            "tool_uses": int(m.group(2)) if m else 0,
            "duration_ms": int(m.group(3)) if m else 0,
        })

    by_type = defaultdict(lambda: {"spawns": 0, "tokens": 0, "tool_uses": 0, "duration_ms": 0})
    for r in subagents:
        d = by_type[r["subagent_type"]]
        d["spawns"] += 1
        d["tokens"] += r["tokens"]
        d["tool_uses"] += r["tool_uses"]
        d["duration_ms"] += r["duration_ms"]

    sub_tokens = sum(r["tokens"] for r in subagents)

    # Output
    bar = "=" * 70
    print(bar)
    print("RUN STATS")
    print(bar)
    print(f"transcript: {path}")
    print(f"events:     {len(events)}")
    first_ts = next((e.get("timestamp") for e in events if e.get("timestamp")), None)
    last_ts = None
    for e in reversed(events):
        if e.get("timestamp"):
            last_ts = e.get("timestamp")
            break
    if first_ts and last_ts:
        print(f"window:     {first_ts}  ->  {last_ts}")
        try:
            a = datetime.fromisoformat(first_ts.replace("Z", "+00:00"))
            b = datetime.fromisoformat(last_ts.replace("Z", "+00:00"))
            delta = (b - a).total_seconds()
            print(f"duration:   {delta/60:.1f} min ({delta:.0f} s)")
        except Exception:
            pass
    print()

    print(bar)
    print("MAIN SESSION (orchestrator)")
    print(bar)
    print(f"  Assistant turns:           {main['turns']:>10,}")
    print(f"  Input (non-cache):         {main['input_tokens']:>10,}")
    print(f"  Cache create:              {main['cache_creation_input_tokens']:>10,}")
    print(f"  Cache read:                {main['cache_read_input_tokens']:>10,}")
    print(f"  Output:                    {main['output_tokens']:>10,}")
    print(f"  TOTAL:                     {main['total']:>10,}")
    print(f"  Estimated cost (Sonnet 4.6): ${main_cost:.2f}")
    print()

    print(bar)
    print("TOOL CALLS")
    print(bar)
    print(f"  Total:    {sum(tool_counts.values())}")
    print(f"  Distinct: {len(tool_counts)}")
    for n, c in tool_counts.most_common():
        print(f"    {c:>5d}  {n}")
    print()

    print(bar)
    print(f"SUBAGENTS ({len(subagents)} spawns)")
    print(bar)
    if subagents:
        print(f"  Totals by type:")
        print(f"  {'type':28}  {'spawns':>7}  {'tokens':>10}  {'tools':>7}  {'dur(s)':>8}")
        print(f"  {'-'*28}  {'-'*7}  {'-'*10}  {'-'*7}  {'-'*8}")
        for t, d in sorted(by_type.items(), key=lambda kv: -kv[1]["tokens"]):
            print(f"  {t[:28]:28}  {d['spawns']:>7}  {d['tokens']:>10,}  {d['tool_uses']:>7}  {d['duration_ms']/1000:>8.1f}")
        print()
        sub_cost = sub_tokens * 8.0 / 1_000_000  # blended estimate
        print(f"  Sum tokens: {sub_tokens:,}")
        print(f"  Estimated cost (@$8/M blended): ${sub_cost:.2f}")
    else:
        sub_cost = 0
        print("  (no Agent spawns recorded)")
    print()

    print(bar)
    print("GRAND TOTAL")
    print(bar)
    grand = main["total"] + sub_tokens
    print(f"  Tokens:  {grand:,}")
    print(f"  Cost:    ${main_cost + sub_cost:.2f}  (main exact + subagents blended)")
    print()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""PostToolUse hook for the autonomous-runner.

On every tool call: refresh STATUS.md.last_heartbeat_at.
On Agent tool calls: increment agents_spawned + bucket.spawned in
STATUS.md.stats, read the subagent's token count from the structured
tool_response (totalTokens), add it to bucket.tokens and
stats.total_tokens, refresh estimated_usd, and append a granular record
to the subagent-tokens ledger.

The token count comes from tool_response.totalTokens (a JSON field on the
Agent result), with the per-iteration split under tool_response.usage.
There is no <usage> text trailer.

Always exits 0. Empty stdout = continue normally. Side-effects only.

Verification mode: --self-test runs a small in-memory smoke and exits.
"""

import json
import os
import re
import sys
import tempfile
import shutil
from datetime import datetime, timezone

STATUS_PATH_DEFAULT = "planning/m4.5/STATUS.md"
LEDGER_PATH_DEFAULT = "planning/m4.5/LOG/subagent-tokens.jsonl"
USD_PER_MTOKEN_DEFAULT = 8.0

# Bucket names in STATUS.md.stats.by_role
BUCKETS = ("spec_author", "spec_review", "phase_worker", "phase_remediation", "council")

PHASE_RE = re.compile(r"A\d+")


def now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def classify_subagent(subagent_type: str, name: str, team_name: str) -> str:
    """Pick the by_role bucket for an Agent spawn."""
    name_l = (name or "").lower()
    team_l = (team_name or "").lower()
    if "council" in team_l or "council" in name_l:
        return "council"
    if subagent_type == "ArchitectReviewer":
        return "spec_review"
    if subagent_type == "SystemArchitect":
        return "spec_author"
    if "remediation" in name_l:
        return "phase_remediation"
    if subagent_type in ("RefactoringSpecialist", "SoftwareDeveloper"):
        return "phase_worker"
    if subagent_type == "QaTester":
        return "council"
    return "phase_worker"  # safe default


def extract_phase(name: str):
    """Phase id (e.g. A2) parsed from a worker name like m4.5-A2, else None."""
    match = PHASE_RE.search(name or "")
    return match.group(0) if match else None


def extract_agent_telemetry(tool_input: dict, tool_response):
    """From an Agent call's input + structured response, return
    (bucket, total_tokens, ledger_record)."""
    subagent_type = tool_input.get("subagent_type", "")
    name = tool_input.get("name") or tool_input.get("description", "")
    team_name = tool_input.get("team_name", "")
    bucket = classify_subagent(subagent_type, name, team_name)

    response = tool_response
    if isinstance(response, str):
        try:
            response = json.loads(response)
        except Exception:
            response = {}
    if not isinstance(response, dict):
        response = {}

    try:
        total_tokens = int(response.get("totalTokens") or 0)
    except (TypeError, ValueError):
        total_tokens = 0

    usage = response.get("usage") if isinstance(response.get("usage"), dict) else {}
    tool_stats = response.get("toolStats") if isinstance(response.get("toolStats"), dict) else {}

    record = {
        "ts": now_iso(),
        "phase": extract_phase(name),
        "bucket": bucket,
        "subagent_type": subagent_type,
        "name": name,
        "total_tokens": total_tokens,
        "usage": usage,
        "duration_ms": response.get("totalDurationMs"),
        "tool_stats": tool_stats,
    }
    return bucket, total_tokens, record


def append_ledger(path: str, record: dict) -> bool:
    """Append one JSON line to the subagent-tokens ledger. Best effort:
    on I/O failure, log to stderr (invisible to Claude Code) and continue,
    since the hook must never break the run."""
    try:
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        with open(path, "a") as handle:
            handle.write(json.dumps(record) + "\n")
        return True
    except OSError as error:
        print(f"post-tool: ledger append failed: {error}", file=sys.stderr)
        return False


def update_status_md(
    path: str,
    *,
    heartbeat: str | None = None,
    bucket: str | None = None,
    add_tokens: int = 0,
    usd_per_mtoken: float = USD_PER_MTOKEN_DEFAULT,
) -> bool:
    """Atomic update of STATUS.md. Returns True if file was rewritten."""
    if not os.path.exists(path):
        return False
    with open(path) as f:
        text = f.read()
    original = text

    if heartbeat is not None:
        text = re.sub(
            r'^(last_heartbeat_at:\s*)(?:"[^"]*"|null)\s*$',
            f'\\g<1>"{heartbeat}"',
            text,
            count=1,
            flags=re.M,
        )

    if bucket is not None and bucket in BUCKETS:
        # agents_spawned
        text = re.sub(
            r"^(    agents_spawned:\s*)(\d+)\s*$",
            lambda m: f"{m.group(1)}{int(m.group(2)) + 1}",
            text,
            count=1,
            flags=re.M,
        )
        # by_role.<bucket>: { spawned: N, tokens: M }
        # alignment whitespace varies; tolerant regex
        pat = (
            rf"^(\s*{re.escape(bucket)}\s*:\s+\{{\s*spawned:\s*)(\d+)"
            rf"(\s*,\s*tokens:\s*)(\d+)(\s*\}}\s*)$"
        )
        text = re.sub(
            pat,
            lambda m: (
                f"{m.group(1)}{int(m.group(2)) + 1}"
                f"{m.group(3)}{int(m.group(4)) + add_tokens}{m.group(5)}"
            ),
            text,
            count=1,
            flags=re.M,
        )

    if add_tokens:
        # total_tokens
        text = re.sub(
            r"^(    total_tokens:\s*)(\d+)\s*$",
            lambda m: f"{m.group(1)}{int(m.group(2)) + add_tokens}",
            text,
            count=1,
            flags=re.M,
        )
        # estimated_usd derived from current total_tokens
        m = re.search(r"^    total_tokens:\s*(\d+)\s*$", text, re.M)
        if m:
            total = int(m.group(1))
            estimated = total * usd_per_mtoken / 1_000_000
            text = re.sub(
                r"^(    estimated_usd:\s*)[\d.]+\s*$",
                f"\\g<1>{estimated:.2f}",
                text,
                count=1,
                flags=re.M,
            )

    if text == original:
        return False
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(text)
    os.replace(tmp, path)
    return True


def main():
    if "--self-test" in sys.argv:
        run_self_test()
        return

    status_path = os.environ.get("STATUS_PATH", STATUS_PATH_DEFAULT)
    ledger_path = os.environ.get("LEDGER_PATH", LEDGER_PATH_DEFAULT)
    usd_per_mtoken = float(os.environ.get("USD_PER_MTOKEN", USD_PER_MTOKEN_DEFAULT))

    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # hook contract: always exit 0

    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {}) or {}
    tool_response = payload.get("tool_response", payload.get("tool_result"))

    bucket = None
    add_tokens = 0
    if tool_name == "Agent":
        bucket, add_tokens, record = extract_agent_telemetry(tool_input, tool_response)
        append_ledger(ledger_path, record)

    update_status_md(
        status_path,
        heartbeat=now_iso(),
        bucket=bucket,
        add_tokens=add_tokens,
        usd_per_mtoken=usd_per_mtoken,
    )
    sys.exit(0)


SAMPLE_STATUS = """---
last_heartbeat_at: null
stats:
    agents_spawned: 0
    total_tokens: 0
    estimated_usd: 0.00
    by_role:
        spec_author:       { spawned: 0, tokens: 0 }
        spec_review:       { spawned: 0, tokens: 0 }
        phase_worker:      { spawned: 0, tokens: 0 }
        phase_remediation: { spawned: 0, tokens: 0 }
        council:           { spawned: 0, tokens: 0 }
---
"""


def run_self_test():
    workdir = tempfile.mkdtemp()
    try:
        status = os.path.join(workdir, "STATUS.md")
        with open(status, "w") as f:
            f.write(SAMPLE_STATUS)

        # heartbeat-only
        update_status_md(status, heartbeat="2026-01-01T00:00:00Z")
        text = open(status).read()
        assert 'last_heartbeat_at: "2026-01-01T00:00:00Z"' in text, "heartbeat failed"

        # Agent spawn with usage 12345
        update_status_md(
            status,
            heartbeat="2026-01-01T00:00:01Z",
            bucket="phase_worker",
            add_tokens=12345,
        )
        text = open(status).read()
        assert "agents_spawned: 1" in text, "agents_spawned failed"
        assert "total_tokens: 12345" in text, "total_tokens failed"
        assert "phase_worker:      { spawned: 1, tokens: 12345 }" in text, "by_role failed"
        assert "estimated_usd: 0.10" in text, f"estimated_usd wrong: {text}"

        # Another spawn into council
        update_status_md(
            status,
            heartbeat="2026-01-01T00:00:02Z",
            bucket="council",
            add_tokens=5000,
        )
        text = open(status).read()
        assert "agents_spawned: 2" in text
        assert "total_tokens: 17345" in text
        assert "council:           { spawned: 1, tokens: 5000 }" in text

        # Classification
        assert classify_subagent("SystemArchitect", "spec author", "") == "spec_author"
        assert classify_subagent("ArchitectReviewer", "", "") == "spec_review"
        assert classify_subagent("RefactoringSpecialist", "A2 worker", "") == "phase_worker"
        assert classify_subagent("RefactoringSpecialist", "remediation 1/10", "") == "phase_remediation"
        assert classify_subagent("SoftwareDeveloper", "council-dev", "dev-council") == "council"
        assert classify_subagent("QaTester", "council-qa", "dev-council") == "council"

        # Structured Agent telemetry (precursor-1 response shape)
        sample_response = {
            "status": "completed",
            "totalDurationMs": 4573,
            "totalTokens": 39686,
            "totalToolUseCount": 1,
            "usage": {
                "input_tokens": 2,
                "cache_read_input_tokens": 39591,
                "cache_creation_input_tokens": 88,
                "output_tokens": 5,
            },
            "toolStats": {"bashCount": 1, "editFileCount": 0},
        }
        bucket, tokens, record = extract_agent_telemetry(
            {"subagent_type": "RefactoringSpecialist", "name": "m4.5-A2"},
            sample_response,
        )
        assert bucket == "phase_worker", f"bucket wrong: {bucket}"
        assert tokens == 39686, f"tokens wrong: {tokens}"
        assert record["phase"] == "A2", f"phase wrong: {record['phase']}"
        assert record["usage"]["cache_read_input_tokens"] == 39591, "usage split lost"
        assert record["tool_stats"]["bashCount"] == 1, "tool_stats lost"

        # tool_response delivered as a JSON string still parses
        _, tokens_from_string, _ = extract_agent_telemetry(
            {"subagent_type": "SystemArchitect", "name": "spec author"},
            json.dumps(sample_response),
        )
        assert tokens_from_string == 39686, f"string-parse tokens wrong: {tokens_from_string}"

        # missing totalTokens -> 0, no crash; council classification preserved
        _, tokens_missing, record_missing = extract_agent_telemetry(
            {"subagent_type": "QaTester", "name": "council-qa", "team_name": "dev-council"},
            {"status": "completed"},
        )
        assert tokens_missing == 0, "missing-token fallback wrong"
        assert record_missing["bucket"] == "council", "missing-token bucket wrong"

        assert extract_phase("m4.5-A2") == "A2"
        assert extract_phase("council-dev") is None

        # ledger append round-trips to JSON lines
        ledger = os.path.join(workdir, "subagent-tokens.jsonl")
        assert append_ledger(ledger, record) is True
        assert append_ledger(ledger, record_missing) is True
        ledger_lines = open(ledger).read().splitlines()
        assert len(ledger_lines) == 2, f"ledger line count wrong: {len(ledger_lines)}"
        first_record = json.loads(ledger_lines[0])
        assert first_record["total_tokens"] == 39686 and first_record["phase"] == "A2", "ledger content wrong"

        print("self-test: ok")
    finally:
        shutil.rmtree(workdir)


if __name__ == "__main__":
    main()

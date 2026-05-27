#!/usr/bin/env python3
"""PostToolUse hook for the autonomous-runner.

On every tool call: refresh STATUS.md.last_heartbeat_at.
On Agent tool calls: increment agents_spawned + bucket.spawned in
STATUS.md.stats. If the tool result text contains the
<usage>total_tokens: N tool_uses: M ...</usage> trailer, also add N to
bucket.tokens and to stats.total_tokens, and refresh estimated_usd.

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
USD_PER_MTOKEN_DEFAULT = 8.0

# Bucket names in STATUS.md.stats.by_role
BUCKETS = ("spec_author", "spec_review", "phase_worker", "phase_remediation", "council")

USAGE_RE = re.compile(r"<usage>\s*total_tokens:\s*(\d+)", re.S)


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
    usd_per_mtoken = float(os.environ.get("USD_PER_MTOKEN", USD_PER_MTOKEN_DEFAULT))

    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # hook contract: always exit 0

    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {}) or {}
    # PostToolUse field name may vary across Claude Code versions
    tool_result = payload.get("tool_response", payload.get("tool_result", ""))
    if isinstance(tool_result, list):
        pieces = [
            p.get("text", "")
            for p in tool_result
            if isinstance(p, dict) and p.get("type") == "text"
        ]
        tool_result = "\n".join(pieces)
    if not isinstance(tool_result, str):
        try:
            tool_result = json.dumps(tool_result)
        except Exception:
            tool_result = str(tool_result)

    bucket = None
    add_tokens = 0
    if tool_name == "Agent":
        bucket = classify_subagent(
            tool_input.get("subagent_type", ""),
            tool_input.get("name") or tool_input.get("description", ""),
            tool_input.get("team_name", ""),
        )
        m = USAGE_RE.search(tool_result)
        if m:
            try:
                add_tokens = int(m.group(1))
            except Exception:
                add_tokens = 0

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

        print("self-test: ok")
    finally:
        shutil.rmtree(workdir)


if __name__ == "__main__":
    main()

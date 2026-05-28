#!/usr/bin/env python3
"""Worker write-scope decision for the M4.5 sandbox (deny-by-default).

Given the writing session's cwd and the target file_path, decide whether a
Write/Edit is allowed:

  - cwd NOT inside a worktree  -> runner's own write -> ALLOW.
  - cwd inside .claude/worktrees/<id>/ -> worker write -> the canonicalized
    target must be INSIDE that worktree AND match the active phase's touch
    list; otherwise DENY.

Canonicalization uses realpath, so `..` traversal and symlinks resolve before
the containment check (a worker cannot escape via ../ or a planted symlink).
Matching is slash-respecting: the pattern and path are split on `/` and matched
segment-by-segment, so `*` never crosses a directory boundary (`src/core/*`
matches `src/core/types.ts` but not `src/core/sub/deep.ts`).

Usage:
  scope-check.py <cwd> <file_path>     exit 0 = allow, exit 1 = deny (reason on stdout)
  scope-check.py --self-test
"""

import fnmatch
import os
import sys

WORKTREES_MARKER = "/.claude/worktrees/"


def split_worktree(cwd: str):
    """Return (main_repo, worktree_root) if cwd is inside an agent worktree,
    else (None, None)."""
    idx = cwd.find(WORKTREES_MARKER)
    if idx == -1:
        return None, None
    main_repo = cwd[:idx]
    after = cwd[idx + len(WORKTREES_MARKER):]
    agent_id = after.split("/", 1)[0]
    if not agent_id:
        return None, None
    worktree_root = main_repo + WORKTREES_MARKER + agent_id
    return main_repo, worktree_root


def segment_match(pattern: str, path: str) -> bool:
    """Slash-respecting glob: equal segment count, fnmatch per segment."""
    pparts = pattern.split("/")
    aparts = path.split("/")
    if len(pparts) != len(aparts):
        return False
    return all(fnmatch.fnmatch(a, p) for a, p in zip(aparts, pparts))


def path_allowed(rel: str, touch_list_path: str) -> bool:
    if not os.path.isfile(touch_list_path):
        return False
    with open(touch_list_path) as handle:
        for line in handle:
            pattern = line.strip()
            if not pattern or pattern.startswith("#"):
                continue
            if segment_match(pattern, rel):
                return True
    return False


def decide(cwd: str, file_path: str):
    """Return (allowed: bool, reason: str)."""
    main_repo, worktree_root = split_worktree(cwd)
    if worktree_root is None:
        return True, "runner write (outside any worktree)"

    abs_target = file_path if os.path.isabs(file_path) else os.path.join(cwd, file_path)
    canonical = os.path.realpath(abs_target)
    root_canonical = os.path.realpath(worktree_root)

    if canonical != root_canonical and not canonical.startswith(root_canonical + os.sep):
        return False, f"write to '{canonical}' is outside the active worktree"

    rel = os.path.relpath(canonical, root_canonical)

    active_file = os.path.join(main_repo, "planning", "m4.5", "scope", "ACTIVE")
    try:
        with open(active_file) as handle:
            phase = handle.read().strip()
    except OSError:
        phase = ""
    if not phase:
        return False, f"no active phase at {active_file}; refusing worker write to '{rel}'"

    touch_list = os.path.join(main_repo, "planning", "m4.5", "scope", f"{phase}.touch.txt")
    if path_allowed(rel, touch_list):
        return True, f"in phase {phase} allowlist"
    return False, f"'{rel}' is outside phase {phase} allowlist"


def main():
    if "--self-test" in sys.argv:
        run_self_test()
        return
    # --match <touch_list> <rel_path>: exit 0 if rel matches the list (used by
    # phase-diff.sh so the post-hoc gate shares this slash-respecting matcher).
    if len(sys.argv) >= 2 and sys.argv[1] == "--match":
        if len(sys.argv) != 4:
            print("usage: scope-check.py --match <touch_list> <rel_path>", file=sys.stderr)
            sys.exit(2)
        sys.exit(0 if path_allowed(sys.argv[3], sys.argv[2]) else 1)
    if len(sys.argv) != 3:
        print("usage: scope-check.py <cwd> <file_path>", file=sys.stderr)
        sys.exit(2)
    allowed, reason = decide(sys.argv[1], sys.argv[2])
    if allowed:
        sys.exit(0)
    print(reason)
    sys.exit(1)


def run_self_test():
    import tempfile
    import shutil

    fail = 0
    main_repo = tempfile.mkdtemp()
    try:
        scope_dir = os.path.join(main_repo, "planning", "m4.5", "scope")
        os.makedirs(scope_dir)
        with open(os.path.join(scope_dir, "ACTIVE"), "w") as f:
            f.write("A2\n")
        with open(os.path.join(scope_dir, "A2.touch.txt"), "w") as f:
            f.write("src/core/types.ts\nsrc/core/*.ts\n")
        worktree = os.path.join(main_repo, ".claude", "worktrees", "agent-test")
        os.makedirs(os.path.join(worktree, "src", "core", "sub"))

        def check(name, cwd, fp, expect_allowed):
            nonlocal fail
            allowed, reason = decide(cwd, fp)
            if allowed != expect_allowed:
                print(f"FAIL {name}: allowed={allowed} reason={reason}")
                fail = 1

        # runner write (cwd = main repo) -> allow
        check("runner-main-write", main_repo, os.path.join(main_repo, "src/x.ts"), True)
        # worker in-scope -> allow
        check("worker-in-scope", worktree, "src/core/types.ts", True)
        check("worker-in-scope-glob", worktree, "src/core/helper.ts", True)
        # worker deep out-of-scope (glob must not cross /) -> deny
        check("worker-deep-out", worktree, "src/core/sub/deep.ts", False)
        # worker file not in list -> deny
        check("worker-not-listed", worktree, "src/evil.ts", False)
        # worker escaping via .. -> deny (canonical outside worktree)
        check("worker-dotdot-escape", worktree, "../../../etc/passwd", False)
        # worker absolute path into main repo -> deny
        check("worker-abs-main-repo", worktree, os.path.join(main_repo, "src/core/types.ts"), False)
        # worker absolute path to home -> deny
        check("worker-abs-home", worktree, os.path.expanduser("~/.claude/settings.json"), False)

        # missing ACTIVE -> deny
        os.remove(os.path.join(scope_dir, "ACTIVE"))
        check("worker-no-active", worktree, "src/core/types.ts", False)

        # matcher unit checks
        assert segment_match("src/core/*", "src/core/types.ts")
        assert not segment_match("src/core/*", "src/core/sub/deep.ts")
        assert segment_match("src/*/*.test.ts", "src/core/x.test.ts")
        assert not segment_match("src/*/*.test.ts", "src/a/b/x.test.ts")

        print("self-test: ok" if fail == 0 else "self-test: FAILED")
        if fail:
            sys.exit(1)
    finally:
        shutil.rmtree(main_repo)


if __name__ == "__main__":
    main()

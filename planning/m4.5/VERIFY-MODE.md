# Empirical verification: per-spawn `mode` under `--dangerously-skip-permissions`

**Question**: When a parent `claude` session is launched with `--dangerously-skip-permissions`, and that session spawns a subagent via the Agent tool with `mode: "default"`, is the per-spawn `mode` honored or overridden?

**Result**: **Overridden**. The parent's permission mode takes precedence and cannot be overridden by the subagent's per-spawn `mode`.

**Source**: Official Claude Code documentation, subagents page ([code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents)):

> If the parent uses `bypassPermissions` or `acceptEdits`, this takes precedence and cannot be overridden.

This applies symmetrically to `auto` mode and to subagent frontmatter `permissionMode`.

**Consequence for M4.5**:

- `mode: "default"` on the Agent spawn is a no-op when the driver runs under `--dangerously-skip-permissions`.
- The PreToolUse hook at `planning/m4.5/hooks/sandbox.sh` is the **only** worker-level dynamic enforcement layer. It is not defense-in-depth; it is the line.
- The hook must be live and self-test green before any worker is spawned. If the hook fails to load, the driver refuses to spawn the worker (see §Safety hatches in `PLAN.md`).
- A second static layer is added via `settings.local.json` in each worktree, with a `permissions.deny` block that mirrors the hook's command deny-list. This is belt-and-braces: the hook does the dynamic checks (write paths derived from the active spec), the deny-list is static and survives if the hook crashes.

**Recorded**: 2026-05-26.

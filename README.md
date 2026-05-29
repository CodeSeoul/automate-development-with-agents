# Agent Demo

A template repository for an agentic development workshop. It ships a ready-to-use
`AGENTS.md` (imported by `CLAUDE.md`) so that any AI coding agent picks up sensible,
research-backed instructions the moment it starts working here.

This README explains *why* `AGENTS.md` contains what it does, so participants can adapt it
with intent rather than copying blindly.

> **Workshop slides:** [Automate Development with Agents](https://docs.google.com/presentation/d/1-dO61eMMYrM1vwixzLLnmZm6WNo9DkADXFnYc8oZ31M/edit)

## What is AGENTS.md?

`AGENTS.md` is an open, increasingly standard place to give AI coding agents the context
and instructions they need — build conventions, guardrails, and house style. It's the
agent-facing counterpart to a README: the README is for humans, `AGENTS.md` is for the
agent. Most major coding agents read it automatically, and here `CLAUDE.md` simply imports
it (`@AGENTS.md`) so Claude Code and others share one source of truth.

## Reasoning behind the contents

The instructions were shaped by current best-practice research on agent context files. The
guiding ideas:

### Keep it short and precise
Bigger context files don't help — they hurt. A study across 138 real-world repositories
found that bloated or auto-generated context files *reduced* task success while raising
inference cost by ~20%, and that minimal, developer-written guidance helped only marginally
and only when it was tight. So the file is capped at ~150 lines, and every line is held to
one test: *would removing it cause the agent to make a mistake?* If not, it's cut.

### Pair every prohibition with an alternative
This is the single most consistent finding. A list of "don'ts" with no "dos" makes agents
over-cautious — they explore more, do less, and stall when a rule blocks the obvious path.
So every prohibition in `AGENTS.md` names the thing to do instead (e.g. "don't commit
secrets — read them from environment variables").

### Be specific, and don't make the agent do a tool's job
Vague guidance ("format properly") gives an agent nothing verifiable. Where rules exist
they're concrete. And the file explicitly defers formatting/linting to deterministic
tools, which are faster, cheaper, and more reliable than asking a model to enforce style.

### Use conventional structure
Agents have seen millions of READMEs and have strong priors about where things live.
The file uses familiar section names (Conventions, Git & commits, etc.) and shallow
heading depth so the agent finds rules where it expects them.

### Avoid stale structural maps
We deliberately *don't* document the repo's file layout or architecture. Those maps go
stale fast, and the same research showed architectural overviews increased cost and
encouraged unnecessary file traversal without improving success. The file stays focused on
behavior, not structure.

### Favor verification and honesty
Agents are instructed to actually run builds/tests/linters before claiming success and to
report failures plainly. The most expensive failure mode is an agent that confidently
asserts work it never verified.

## Using this template

1. Read `AGENTS.md` — it applies to every agent in this repo.
2. Specialize it for your project: add your real build/test/lint conventions, and tighten
   the prohibitions to your stack. Keep pairing each "don't" with a "do."
3. Update `AGENTS.md` in the same change that alters a convention. Stale instructions are
   worse than none.

## References

- [AGENTS.md — open format](https://agents.md/)
- [A good AGENTS.md is a model upgrade (Augment Code)](https://www.augmentcode.com/blog/how-to-write-good-agents-dot-md-files)
- [How to Build Your AGENTS.md, 2026 (Augment Code)](https://www.augmentcode.com/guides/how-to-build-agents-md)
- [Writing a good CLAUDE.md (HumanLayer)](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)

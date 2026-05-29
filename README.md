# Automate Development with Agents

## Pomodoro Timer — Quick Start

A Pomodoro timer built as a live workshop demo. Runs with a single command; no
packages, no build step, no database.

### Run

```bash
python3 server.py
```

Open the printed URL (`http://127.0.0.1:8000/`) in any browser. Use a different port
with the `PORT` environment variable: `PORT=9000 python3 server.py`.

### Controls

| Button | Action |
|--------|--------|
| **Start** | Begin the current interval (25 min Work to start). |
| **Pause** | Freeze the timer mid-interval. |
| **Resume** | Continue from where it was paused (Start button re-labels itself). |
| **Skip** | End the current interval immediately and advance to the next. |
| **Reset** | Return to idle Work interval 1 / 25:00 from any state. |

The cycle runs Work → Short Break, four times, with the fourth Short Break replaced by a
Long Break (the classic 25/5/15 Pomodoro). Each new interval waits for you to press
Start rather than auto-advancing, which keeps live demos predictable.

### Tests

Open `tests/test_cycle.html` directly in a browser (no server needed) to run the
pure-logic unit tests for the cycle sequence, skip rules, and wall-clock timing seam.

---


A template repository for an agentic development workshop. It ships a complete,
opinionated **multi-agent development pipeline** for Claude Code — a coordinating
orchestrator, specialized subagents, file-based artifact handoff, and deterministic
guard/cleanup hooks — so participants can see how the pieces fit together and adapt them
to their own projects.

> **Workshop slides:** [Automate Development with Agents](https://docs.google.com/presentation/d/1-dO61eMMYrM1vwixzLLnmZm6WNo9DkADXFnYc8oZ31M/edit)

## What's in here

- **A multi-agent pipeline** (`.claude/agents/`) coordinated by a default `orchestrator`.
- **Artifact directories** the agents hand off through: `specs/`, `plans/`, `adr/`.
- **`AGENTS.md`** — always-apply conventions every agent follows (imported by `CLAUDE.md`).
- **Hooks** (`.claude/hooks/`, wired in `.claude/settings.json`) that enforce guardrails deterministically.

## The pipeline

The `orchestrator` is the **default session agent** (`"agent": "orchestrator"` in
`.claude/settings.json`). It's the only agent that talks to you and the only one that can
spawn others. For a non-trivial change it creates one shared git worktree for the feature
and delegates each stage to a specialist — passing **file paths, never artifact content**,
so its own context stays lean.

```
requirements → research → plan → implement → review
```

| Stage | Agent | Model | Writes | Reads |
|---|---|---|---|---|
| Requirements | `requirements-engineer` | opus | `specs/` | the request |
| Research | `researcher` | haiku | — (read-only) | the codebase |
| Plan | `technical-planner` | opus | `plans/` | the spec |
| Implement | `implementation-engineer` | sonnet | code + `adr/` | spec + plan |
| Review | `code-reviewer` | opus | — (read-only) | spec + plan + diff |

Two patterns make it work:

- **Artifact bus via a shared worktree.** Each stage writes its artifact to a file in the
  feature worktree; the next stage reads it from there. The orchestrator only passes the
  path. The `prune-worktrees` hook reclaims the worktree afterward.
- **Kick-backs to the orchestrator.** Subagents can't spawn subagents, so when one needs
  help it returns a signal and the orchestrator resumes it: `NEEDS RESEARCH:` (→ runs the
  `researcher`) or `NEEDS DECISION:` (→ asks *you*). This is how requirements get
  clarified without the orchestrator's context ballooning.

The pipeline **gates on requirements**: planning and implementation don't begin until the
spec is `Ratified` (every high-impact assumption resolved or accepted by you).

## Artifacts and their lanes

Each artifact type has one home, so the agents never blur requirements, plans, and
decisions together:

- **`AGENTS.md`** — always-apply *invariants* (style, prohibitions, workflow). Read every time.
- **`specs/`** — *requirements*: what to build and why, with testable Given/When/Then
  acceptance criteria. Lifecycle `Draft → Ratified → Delivered`. See `specs/README.md`.
- **`plans/`** — *implementation plans*: the ordered how, derived from a spec. See `plans/README.md`.
- **`adr/`** — *architecture decision records*: the why-this-way, with alternatives and
  consequences. Lifecycle `Proposed → Accepted → Superseded`, where **merging the branch
  is the act of acceptance**. See `adr/README.md`.

## Hooks

Deterministic guardrails the harness runs automatically (configured in `.claude/settings.json`):

- **`agent-write-guard.sh`** (`PreToolUse`) — confines the `requirements-engineer` to
  `specs/` and the `technical-planner` to `plans/`, so upstream agents can't touch code.
- **`prune-worktrees.sh`** (`SessionEnd`) — reclaims feature worktrees whose work is safely
  merged or pushed, while refusing any with uncommitted, unmerged, and unpushed work.

## Why `AGENTS.md` looks the way it does

`AGENTS.md` is the agent-facing counterpart to this README. Its design follows current
best-practice research on agent context files:

- **Short and precise.** Bloated context files measurably *reduce* task success and raise
  cost; the file is capped at ~150 lines, and every line earns its place ("would removing
  it cause a mistake?").
- **Every prohibition pairs with an alternative.** "Don't" with no "do" makes agents
  over-cautious — so each prohibition names what to do instead.
- **Specific, and defers to tools.** No vague guidance; formatting/linting is left to
  deterministic tools, not the model.
- **Conventional structure, no stale maps.** Familiar section names, and it deliberately
  avoids describing repo layout/architecture (those go stale and mislead) — that's this
  README's job, not AGENTS.md's.
- **Verification and honesty.** Agents run builds/tests/linters before claiming success and
  report failures plainly.

## Using this template

1. Read `AGENTS.md` — it applies to every agent here. Specialize it for your stack (real
   build/test/lint commands, conventions), keeping each "don't" paired with a "do."
2. Adapt the agents in `.claude/agents/` to your workflow, and the hooks in `.claude/hooks/`
   to your guardrails.
3. Start a session — the `orchestrator` runs by default — and describe a change. It will
   drive the pipeline, asking you to ratify the spec before any code is written.
4. Keep `AGENTS.md`, specs, plans, and ADRs updated in the same change that alters them;
   stale instructions are worse than none.

## References

- [AGENTS.md — open format](https://agents.md/)
- [Create custom subagents (Claude Code)](https://code.claude.com/docs/en/sub-agents)
- [A good AGENTS.md is a model upgrade (Augment Code)](https://www.augmentcode.com/blog/how-to-write-good-agents-dot-md-files)
- [Writing a good CLAUDE.md (HumanLayer)](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)

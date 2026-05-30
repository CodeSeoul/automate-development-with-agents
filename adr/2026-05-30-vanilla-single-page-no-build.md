---
title: Vanilla single-page app, no build step, file:// compatible
date: 2026-05-30
status: Accepted
supersedes:
superseded-by:
---

# 2026-05-30 — Vanilla single-page app, no build step, file:// compatible

## Context
The Pomodoro app spec (specs/2026-05-30-pomodoro-app.md) mandates zero runtime
dependencies, zero build tooling, no CDN/external assets, and a hard requirement that the
app open and fully function via `file://` as well as from any static server. Browsers
block ES-module fetches and many cross-origin/`file://` fetches, which constrains how code
can be split across files.

## Decision
We will build the app as three sibling static files — `index.html`, `styles.css`,
`app.js` — loaded with relative paths via a same-origin `<link>` and a single **classic
(non-module) `<script defer>`**. We will use no `import`/`export`, no bundler, no
transpiler, and no package dependencies. All JavaScript lives in `app.js` wrapped to avoid
global leakage. State is a single in-memory object rendered by hand; no framework.

## Alternatives considered
- **ES modules (`type="module"` + `import`)** — cleaner separation, but browsers block
  module loading under `file://`, violating the hard `file://` requirement.
- **Single inlined HTML file (CSS + JS in `<style>`/`<script>`)** — guaranteed to work
  under `file://`, but harms readability, diffing, and editing; classic external scripts
  work under `file://` too, so the split is safe.
- **A framework/bundler (React/Vite/etc.)** — directly violates zero-dependency/zero-build.

## Consequences
Easier: instant load, trivial hosting, no toolchain to maintain, works offline and via
`file://`. Harder: no module encapsulation (mitigated by an IIFE and disciplined naming);
no automated test/build harness by default, so verification is largely manual plus a
lightweight no-dependency assertion approach (see the plan's Test Strategy). Adds a
follow-up convention: any future code-splitting must preserve the classic-script,
no-`import` constraint or supersede this ADR.

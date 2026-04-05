# Architecture Style

Status: draft
Last updated: 2026-04-05

## Purpose

Capture project standards for code structure, module boundaries, and architectural decision-making.

## General rules

- Prefer deeper modules with simpler boundaries when the code earns them.

## Decision recording

- Record durable cross-cutting decisions in `docs/ADRs.md`.
- Keep slice-specific implementation detail in the relevant `TASKS.md`.

## Slice task tracking

- Treat task status as evidence-based tracking of real execution, not conversation state.
- Leave tasks as `todo` during guidance-only conversations unless implementation work has actually started.
- Move a task to `in progress` only when the corresponding execution has begun.
- Move a task to `done` only when its acceptance criteria are satisfied.
- Use task notes for durable decisions, discovered blockers, or verification evidence that will still matter later.

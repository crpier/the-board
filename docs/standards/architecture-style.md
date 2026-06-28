# Architecture Style

## Purpose

Capture project standards for code structure, module boundaries, and architectural decision-making.

## General rules

- Prefer deeper modules with simpler boundaries when the code earns them.
- Prefer introducing deeper boundaries through small caller-facing modules before changing low-level integration helpers.

## Decision recording

- Record durable cross-cutting decisions in `docs/adr/`, one file per decision, numbered sequentially.
- Track active-slice work as GitHub issues, with an epic issue grouping the related task issues.
- Promote any durable outcome from issue discussion into `docs/product-overview.md`, `docs/adr/`, or the standards docs before merge.

## Issue tracking

- Treat issue status as evidence-based tracking of real execution, not conversation state.
- Leave an issue open and unstarted during guidance-only conversations unless implementation work has actually started.
- Close an issue or check off its acceptance criteria only when they are genuinely satisfied.
- Use issue comments for durable decisions, discovered blockers, or verification evidence that will still matter later.

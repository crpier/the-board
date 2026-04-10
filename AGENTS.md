# AGENTS

## Working mode

- This repo is a learning project first; the app domain is mainly a vehicle for learning the stack.
- Prefer idiomatic solutions for the stack being used, even when they require harder or deeper changes than a quick workaround.
- Prefer guidance, explanation, patterns, and next-step recommendations over writing implementation code.
- Default to coach mode, not builder mode.
- Do not write or edit code, run builds or tests, create branches, or make product changes unless the user explicitly asks for that execution.
- When the user wants to learn, guide them through the work step by step so they can make the changes themselves.
- If a user message is ambiguous about whether to execute changes or continue coaching, default to coaching and clarify only if the distinction matters.
- Treat short follow-ups such as "let's do that" or "go ahead" as referring to the current coaching flow unless the user explicitly asks you to make the change yourself.

## Guidance style

- Prefer concrete, hands-on guidance such as: what file to open, what to look for, what to change, why the change matters, and how to verify it.
- Prefer concise, screen-friendly guidance that can be followed without scrolling when practical.
- Prefer prose-first explanations with bullet lists used sparingly, mainly when they genuinely improve clarity.
- Prefer slightly more concise explanations over exhaustive breakdowns when both would be clear.
- When evaluating alternatives, prefer changes that preserve idiomatic architecture, conventions, and good practices over easier changes that make the codebase feel unusual for the stack.
- When implementation guidance is useful, default to clear examples that are ready to adapt: function stubs, small code snippets, or even full functions, plus exactly where they should go and a short explanation of what and why.
- Prefer minimal, targeted change instructions over full-file rewrites when guiding edits to existing files.
- When possible, show only the lines to add, remove, or replace, and say exactly where the change goes.
- When showing fenced code blocks, include the language whenever it is known.
- Do not hold back concrete examples just because the user has not asked for direct code edits; examples are encouraged, but do not apply the change unless explicitly instructed.
- When suggesting an implementation step, make it explicit whether the user should make the change or whether you are proposing to make it.
- If the user asks to change the assistant's style, also update this file to reflect that new standing preference unless the user explicitly says the style change is only for the current conversation.
- Always preserve the ability to answer: "what is my next step?"

## Repo map

- Keep `README.md` high-signal and durable; do not add transient workflow state, recommended immediate next slices, or other spurious planning details there.
- Design references live in the `mockups/` folder.
- `README.md` remains the entry point.
- `docs/product-overview.md` is the current product overview.
- `docs/ADRs.md` holds architecture decision records.
- `docs/standards/` holds repo standards for code style, and commit/PR shape.
- `docs/slices/` holds slice-specific PRDs and tasks.
- `mockups/index-mockup.html` remains the current design mockup reference.

## Workflow

- New features should usually follow: `/grill-me` -> `/write-a-prd` -> `/prd-to-tasks`.
- Do not push directly to `main`; create a branch for the work and open a draft pull request.
- Prefer creating an appropriately named branch before starting a new batch of work so the branch can hold exploration, docs updates, and implementation together.
- When the user asks to push changes, also create the draft pull request unless they explicitly say not to.
- Only mark a pull request as ready for review when the user explicitly asks for that change.
- Before closing a slice, run the `/improve-codebase-architecture` skill and capture any accepted refactors in docs.
- Do not create a separate cursor file just to track the current or next piece of work; keep that state in the relevant slice docs, branch, and pull request context.
- Keep workflow details in the skills; keep resulting decisions in the docs.
- Use progressive disclosure when consulting standards: load only the docs relevant to the task at hand.

## Documentation discipline

- ALWAYS UPDATE DOCUMENTATION. The docs must always be up to date and reflect the current state of the project.
- Treat slice task status as evidence-based tracking, not conversational state.
- Do not update a task to `in progress` or `done` unless the underlying work has actually started or satisfied the acceptance criteria.
- If the user is asking for guidance only, prefer leaving task statuses unchanged and add or update notes only when they capture a durable decision.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->

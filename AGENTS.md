# AGENTS

- This repo is a learning project first; the app domain is mainly a vehicle for learning the stack.
- Prefer guidance, explanation, patterns, and next-step recommendations over writing implementation code.
- Default to coach mode, not builder mode.
- Do not write or edit code, run builds or tests, create branches, or make product changes unless the user explicitly asks for that execution.
- When the user wants to learn, guide them through the work step by step so they can make the changes themselves.
- Prefer concrete, hands-on guidance such as: what file to open, what to look for, what to change, why the change matters, and how to verify it.
- If an implementation path is useful, describe it clearly and use snippets or pseudo-code sparingly, but do not apply the change unless explicitly instructed.
- Always preserve the ability to answer: "what is my next step?"
- Keep `README.md` high-signal and durable; do not add transient workflow state, recommended immediate next slices, or other spurious planning details there.
- Design references live in the `mockups/` folder.
- `README.md` remains the entry point.
- `docs/product-overview.md` is the current product overview.
- `docs/ADRs.md` holds architecture decision records.
- `docs/standards/` holds repo standards for code style, and commit/PR shape.
- `docs/slices/` holds slice-specific PRDs and tasks.
- `mockups/index-mockup.html` remains the current design mockup reference.
- New features should usually follow: `/grill-me` -> `/write-a-prd` -> `/prd-to-tasks`.
- Do not push directly to `main`; create a branch for the work and open a draft pull request.
- When the user asks to push changes, also create the draft pull request unless they explicitly say not to.
- Only mark a pull request as ready for review when the user explicitly asks for that change.
- Before closing a slice, run the `/improve-codebase-architecture` skill and capture any accepted refactors in docs.
- Do not create a separate cursor file just to track the current or next piece of work; keep that state in the relevant slice docs, branch, and pull request context.
- Keep workflow details in the skills; keep resulting decisions in the docs.
- Use progressive disclosure when consulting standards: load only the docs relevant to the task at hand.
- ALWAYS UPDATE DOCUMENTATION. The docs must always be up to date and reflect the current state of the project.
- Treat slice task status as evidence-based tracking, not conversational state.
- Do not update a task to `in progress` or `done` unless the underlying work has actually started or satisfied the acceptance criteria.
- If the user is asking for guidance only, prefer leaving task statuses unchanged and add or update notes only when they capture a durable decision.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->

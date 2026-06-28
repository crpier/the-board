# AGENTS

## Working mode

- Default to builder mode: implement the work, then make it reviewable and explain it.
- Prefer idiomatic solutions for the stack being used, even when they require harder or deeper changes than a quick workaround.
- Write clear, idiomatic code, with non-obvious decisions explained.
- After making changes, walk the user through what changed and why, and call out the parts most worth scrutinizing.
- Keep changes in small, reviewable slices.
- If a user message is ambiguous about whether to implement or only discuss, default to implementing and explaining, and clarify only if the distinction matters.
- Treat short follow-ups such as "let's do that" or "go ahead" as approval to make the change and then walk the user through it for review.

## Review and explanation style

- After implementing, explain the change so the user can review it: what files changed, what each change does, why it matters, and how to verify it.
- Prefer concise, screen-friendly explanations that can be followed without scrolling when practical.
- Prefer prose-first explanations with bullet lists used sparingly, mainly when they genuinely improve clarity.
- Prefer slightly more concise explanations over exhaustive breakdowns when both would be clear.
- Prefer idiomatic architecture, conventions, and good practices over easier changes that make the codebase feel unusual for the stack, and say when you made that tradeoff.
- Proactively flag the parts of a change the user should scrutinize: tradeoffs, alternatives you considered and rejected, and anything non-obvious or easy to get wrong.
- Keep diffs minimal and focused so the change is easy to review; avoid unrelated edits and large rewrites when a targeted change works.
- Treat user pushback and "why did you do it this way?" as review comments: explain the reasoning, and revise the code if the critique holds.
- When showing fenced code blocks, include the language whenever it is known.
- If the user asks to change the assistant's style, also update this file to reflect that new standing preference unless the user explicitly says the style change is only for the current conversation.
- Always preserve the ability to answer: "what is my next step?"

## Workflow

- This project uses `pnpm`; do not suggest `npm install`, `npm run`, `npx`, or other package-manager commands when there is a `pnpm` equivalent. Prefer `pnpm add`, `pnpm <script>`, and `pnpm dlx`/`pnpm exec` as appropriate.

## GitHub workflow

- Use the `gh` CLI for GitHub interactions: issues, PRs, comments, labels, and repo metadata.
- Do not hand-edit GitHub URLs or assume issue state; query with `gh issue view/list` and `gh pr view/list` when needed.
- When there is a relevant GitHub issue, reference it from the implementation work and PR.
- When starting a new unit of work, stash any uncommitted changes, run `git fetch`, then create a new branch from the latest `origin/main`.
- Open the PR against `main`; only merge it when explicitly told to.
- When passing multiline text to `gh`, use `--body-file` with a real file or a heredoc; do not pass escaped `\n` sequences. Verify rendered bodies with `gh pr view` or `gh issue view`.

## Documentation discipline

- ALWAYS UPDATE DOCUMENTATION. The docs must always be up to date and reflect the current state of the project.
- `docs/product-overview.md` is the source of truth for product behavior and requirements. Any mergeable change must match it, or update it in the same branch.
- PR review should explicitly check that the implementation matches `docs/product-overview.md`, and that file should be updated whenever the product truth changes.
- Record durable cross-cutting decisions in `docs/adr/`, one file per decision.
- Project state lives in GitHub issues, not in markdown files: planning, tasks, and roadmap are tracked there, with epics grouping related task issues.
- Treat issue status as evidence-based tracking, not conversational state. Do not close an issue or check off its acceptance criteria unless the underlying work actually satisfies them.
- If the user is asking for guidance only, leave issue state unchanged and add a comment only when it captures a durable decision.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->

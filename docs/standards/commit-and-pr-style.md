# Commit and PR Style

Status: draft
Last updated: 2026-04-05

## Purpose

Define how commits and pull requests should read in this repo.

## Commit style

- Prefer concise, descriptive commit subjects.
- Use present tense and imperative mood.
- Write commit messages around intent, not file-by-file narration.
- Keep unrelated changes out of the same commit when practical.
- Respect commit-time automation such as Husky hooks and fix failures before committing.
- Don't use conventional commits

## Branching and merge flow

- Do not push directly to `main`.
- Create a branch for each slice or focused change.
- Prefer creating the branch before starting the batch of work rather than waiting for the first commit.
- Name branches for the slice or focused change, not for a single task, unless the branch truly is task-scoped.
- Prefer names like `slice/public-feed` over names like `slice/public-feed-task-1` when multiple related tasks may land on the same branch.
- Open a draft pull request for branch work, even when the repo is effectively solo-maintained.
- If branch work is pushed for review, create the draft pull request in the same flow unless explicitly told not to.
- Use the pull request to capture scope, verification, and follow-up decisions before merging.

## Review state

- Default new pull requests to draft.
- Only mark a pull request as ready for review when explicitly requested.

## Pull request shape

- Explain what changed, why it changed, and how it was verified.
- Call out follow-up work explicitly instead of hiding it in prose.
- Keep PRs narrow enough to review coherently.
- Ensure the implementation matches `docs/product-overview.md`, or update that file in the same branch.
- `PRD.md` and `TASKS.md` may exist while a slice is active on its branch, but they should not exist in a mergeable pull request.

## Pull request checklist

- State the scope of the change clearly.
- Link the relevant ADRs or other durable docs.
- Confirm the implementation is consistent with `docs/product-overview.md`, or note the matching product-overview update.
- Summarize verification steps.
- Note any accepted follow-ups or deferred work.
- Confirm `PRD.md` and `TASKS.md` have been deleted or promoted into durable docs before merge.

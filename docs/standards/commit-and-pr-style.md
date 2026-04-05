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
- Open a pull request for branch work, even when the repo is effectively solo-maintained.
- Use the pull request to capture scope, verification, and follow-up decisions before merging.

## Pull request shape

- Explain what changed, why it changed, and how it was verified.
- Call out follow-up work explicitly instead of hiding it in prose.
- Keep PRs narrow enough to review coherently.

## Pull request checklist

- State the scope of the change clearly.
- Link the relevant slice docs or ADRs.
- Summarize verification steps.
- Note any accepted follow-ups or deferred work.

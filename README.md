# the-board

`the-board` is a learning project first and a meme web app second.

The goal is to learn a modern web stack by building something real enough to force product decisions, architectural tradeoffs, iteration, and cleanup. The app itself is intentionally lightweight so the focus stays on slices, workflow, and technical judgment.

## What this project is

- A browse-first meme app with public content, lightweight social interaction, and simple moderation.
- A repo for learning through real vertical slices instead of isolated experiments.
- A place to document decisions, plans, and tradeoffs as the app evolves.

## Current stack direction

- Frontend: `SolidStart` + `TypeScript`
- Backend: `Convex`
- Auth direction: Convex Auth with Google
- Styling direction: Tailwind CSS
- Media direction: Cloudflare `R2`

## Documentation

- `docs/product-overview.md` - enduring product rules and product-level scope
- `docs/ADRs.md` - architecture decision records
- `docs/standards/` - coding, commit, and PR standards
- `docs/slices/` - slice-specific `PRD.md` and `TASKS.md` files
- `mockups/` - design references and UI explorations

## Contributing and orientation

- Start with `docs/product-overview.md` to understand the product.
- Check `docs/ADRs.md` for project-wide decisions.
- Use `docs/standards/` for repo process and quality expectations.
- Use the active slice under `docs/slices/` to see current requirements, tasks, and implementation notes.
- Treat `mockups/index-mockup.html` as the current visual reference for the public feed.
- Do work on a branch and merge through a pull request; do not push directly to `main`.

## Feature workflow

- Start a new feature with `/grill-me` to resolve the problem, scope, and key decisions.
- Then use `/write-a-prd` to turn the resolved interview into `docs/slices/<slice-name>/PRD.md`.
- Then use `/prd-to-tasks` to turn that PRD into `docs/slices/<slice-name>/TASKS.md`.
- Implement the slice on a branch, not on `main`.
- Open a pull request for the branch so scope, verification, and follow-up decisions are captured before merge.
- When branch work is pushed for review, create the pull request in the same flow unless there is an explicit reason not to.
- Before merging, run the `/improve-codebase-architecture` skill and capture any accepted refactors in docs.
- Let the skills carry the detailed interview process; the docs store the resulting decisions and artifacts.

## Project principles

- Prefer clarity and teachable patterns over cleverness.
- Build in small vertical slices.
- Keep documentation current as decisions change.
- Use AI for guidance and workflow support more than bulk implementation.

## Development notes

- This project was created with the [Solid CLI](https://github.com/solidjs-community/solid-cli).

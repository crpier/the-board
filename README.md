# the-board

`the-board` is a learning project first and a meme web app second.

The goal is to learn a modern web stack by building something real enough to force product decisions, architectural tradeoffs, iteration, and cleanup. The app itself is intentionally lightweight so the focus stays on slices, workflow, and technical judgment.

## What this project is

- A browse-first meme app with public content, lightweight social interaction, and simple moderation.
- A repo for learning through real vertical slices instead of isolated experiments.
- A place to document decisions, plans, and tradeoffs as the app evolves.

## Current stack direction

- Frontend: `SolidStart` + `TypeScript`
- Rendering: client-side rendering (`CSR`); the app does not use server-side rendering
- Backend: `Convex`
- Auth direction: Convex Auth with Google
- Styling direction: Tailwind CSS
- Media direction: Cloudflare `R2`

## Documentation

- `docs/product-overview.md` - enduring product rules and product-level scope
- `docs/ROADMAP.md` - likely next slices and medium-term direction
- `docs/ADRs.md` - architecture decision records
- `docs/standards/` - coding, commit, and PR standards
- `PRD.md` and `TASKS.md` - temporary active-slice planning files used only on the working branch
- `mockups/` - design references and UI explorations

## Contributing and orientation

- Start with `docs/product-overview.md` to understand the product.
- Treat `docs/product-overview.md` as the always-current product truth; mergeable changes should match it or update it.
- Check `docs/ROADMAP.md` for likely next slices and medium-term direction.
- Check `docs/ADRs.md` for project-wide decisions.
- Use `docs/standards/` for repo process and quality expectations.
- Use root-level `PRD.md` and `TASKS.md` only for the active slice on the current branch.
- Treat `mockups/index-mockup.html` as the current visual reference for the public feed.
- Do work on a branch and merge through a pull request; do not push directly to `main`.
- `PRD.md` and `TASKS.md` should not exist in a mergeable pull request.

## Project principles

- Prefer clarity and teachable patterns over cleverness.
- Build in small vertical slices.
- Keep documentation current as decisions change.
- Use AI for guidance and workflow support more than bulk implementation.

## Acknowledgements

- The custom skills in this repo are modified versions of work from Matt Pocock's `skills` project: `https://github.com/mattpocock/skills`.
- Parts of this repo's development process are inspired by Matt Pocock's "My 7 phases of AI development": `https://www.aihero.dev/my-7-phases-of-ai-development`.

## Development notes

- This project was created with the [Solid CLI](https://github.com/solidjs-community/solid-cli).

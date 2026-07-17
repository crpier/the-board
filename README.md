# the-board

`the-board` is a meme web app built on a modern web stack.

It is intentionally lightweight, so the focus stays on clean vertical slices, workflow, architectural tradeoffs, and technical judgment rather than feature breadth.

## What this project is

- A browse-first meme app with public content, lightweight social interaction, and simple moderation.
- A repo built in real vertical slices instead of isolated experiments.
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
- `docs/adr/` - architecture decision records, one file per decision
- `docs/standards/` - coding, commit, and PR standards
- `mockups/` - design references and UI explorations
- GitHub issues - active work, planning, and roadmap (epics group related task issues)

## Contributing and orientation

- Start with `docs/product-overview.md` to understand the product.
- Treat `docs/product-overview.md` as the always-current product truth; mergeable changes should match it or update it.
- Check GitHub issues for active work, planned slices, and direction; epics group related task issues.
- Check `docs/adr/` for project-wide decisions.
- Use `docs/standards/` for repo process and quality expectations.
- Treat `mockups/index-mockup.html` as the current visual reference for the public feed.
- Do work on a branch and merge through a pull request; do not push directly to `main`.

## Project principles

- Prefer clarity over cleverness.
- Build in small vertical slices.
- Keep documentation current as decisions change.
- Lean on AI to implement vertical slices, reviewed and refined before merging.

## Acknowledgements

- Parts of this repo's development process are inspired by Matt Pocock's "My 7 phases of AI development": `https://www.aihero.dev/my-7-phases-of-ai-development`.

## Development notes

- Use `pnpm exec convex dev` and `pnpm dev` for local development; the app serves at `http://localhost:5000` by default.
- Local uploads require the R2 bucket CORS policy to allow the app origin
  (normally `http://localhost:5000`), `PUT`, and the `Content-Type` header; see
  `docs/adr/0005-r2-object-storage-for-meme-media.md`.
- This project was created with the [Solid CLI](https://github.com/solidjs-community/solid-cli).

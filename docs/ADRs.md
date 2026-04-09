# ADRs

Status: active
Last updated: 2026-04-09

## 0001 - Documentation Structure

Date: 2026-04-04
Status: accepted

### Context

The project needs documentation that stays useful both for learning and for execution.

The previous structure mixed enduring product rules, slice requirements, implementation thinking, and status tracking across top-level docs. That made it harder to answer simple questions such as what the product is, what the current slice requires, and what the next implementation step should be.

### Decision

The active documentation structure is:

- `README.md` as the entry point for users and contributors
- `docs/product-overview.md` for enduring product rules and product-level scope
- `docs/ADRs.md` for architecture decision records
- `docs/standards/` for repo standards and working agreements
- `docs/slices/<slice-name>/PRD.md` for slice requirements
- `docs/slices/<slice-name>/TASKS.md` for slice task tracking and status
- `mockups/` for visual references

### Consequences

- Product requirements stay separate from high-level product overview.
- Each vertical slice keeps its PRD and task tracking together.
- Cross-cutting technical decisions have one durable home.
- Slice execution details live with the slice instead of in a separate plan document.

## 0002 - Feature Definition Workflow

Date: 2026-04-04
Status: accepted

### Context

The project prefers an interview-driven workflow for defining new features. The custom skills in `.agents/skills/` already encode the detailed interview process, PRD writing process, and PRD-to-task breakdown process.

The docs should support that workflow without restating the same instructions in multiple places.

### Decision

The default workflow for a new feature is:

- `/grill-me` to resolve the feature through user interview
- `/write-a-prd` to produce `docs/slices/<slice-name>/PRD.md`
- `/prd-to-tasks` to produce `docs/slices/<slice-name>/TASKS.md`
- implement the slice tasks on a branch
- open a draft pull request that captures scope, verification, and follow-up work
- `/improve-codebase-architecture` before merging and closing the slice

The skills own the detailed process. The docs hold the resulting product and execution artifacts.

### Consequences

- The repo documents the workflow at a high level without duplicating skill instructions.
- Slice artifacts should stay compatible with the skills that generate them.
- Process changes should usually happen in the skills first, with docs updated only where the visible workflow changes.
- Slice completion includes an explicit pre-merge architecture review step.

## 0003 - Standards Documents

Date: 2026-04-04
Status: accepted

### Context

The repo should document working agreements beyond product and slice definition, including code style, review style, and commit and pull request shape.

These standards should feel professional and reusable without pretending the repo has a public-contributor workflow.

### Decision

Project standards live in `docs/standards/`.

The initial standards set is:

- `docs/standards/code-style.md`
- `docs/standards/architecture-style.md`
- `docs/standards/commit-and-pr-style.md`

The GitHub pull request template should align with these standards.

### Consequences

- Process expectations have a durable home outside slice docs.
- `README.md` and `AGENTS.md` can point to the standards without duplicating them.
- Agents should consult standards progressively instead of loading all process documents for every task.

## 0004 - Branch and Pull Request Workflow

Date: 2026-04-05
Status: accepted

### Context

The project is small and effectively solo-maintained, but it still benefits from a visible review and integration boundary.

Pushing directly to `main` makes it easier to skip scope checks, verification notes, and documentation of follow-up work. That weakens the repo's learning value and makes it harder to reconstruct why a change was made.

### Decision

All substantive work should happen on branches and merge through pull requests.

- Do not push directly to `main`.
- Create a branch for each slice or focused change.
- Open a draft pull request that explains scope, verification, and any accepted follow-up work before merging.
- When branch work is pushed for review, create the draft pull request in the same flow unless there is an explicit reason not to.
- Only mark a pull request as ready for review when explicitly requested.

### Consequences

- `main` stays a cleaner record of reviewed, documented changes.
- Even solo work preserves a lightweight review checkpoint.
- Branch and PR expectations need to be reflected in repo process docs and agent instructions.

## 0005 - Caller-Optimized Public Feed Data Interface

Date: 2026-04-09
Status: accepted

### Context

The public feed route currently assembles its data path directly from several layers:

- Convex query definitions in `convex/`
- Convex HTTP prefetch for SSR
- live Convex subscriptions for client updates
- SolidStart route data loading
- route-level loading and empty-state decisions

That makes the `/` route responsible for both page behavior and transport details. Understanding or changing the public feed requires following the seam between SSR prefetch, hydration, live updates, and backend query wiring.

### Decision

The public feed should move toward a caller-optimized interface centered on the route's primary use case.

The preferred interface shape is a page-facing module with a small API, such as `usePublicFeed()`, that hides:

- SSR preload wiring
- the handoff from SSR data to live client data
- Convex transport setup
- the concrete backend query reference for the public feed

Internally, that module may still use a narrower port or adapter boundary, but callers should depend on a route-shaped interface rather than assembling the transport stack themselves.

### Consequences

- The `/` route can become page-focused instead of transport-focused.
- Public feed behavior becomes easier to test at one boundary.
- SSR and live-update policy for the feed can evolve without forcing route churn.
- The abstraction is intentionally opinionated toward the common caller and may need explicit escape hatches if later pages need different feed behavior.

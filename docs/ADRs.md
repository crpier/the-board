# ADRs

Status: active
Last updated: 2026-04-04

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
- implement the slice tasks
- `/improve-codebase-architecture` before closing the slice

The skills own the detailed process. The docs hold the resulting product and execution artifacts.

### Consequences

- The repo documents the workflow at a high level without duplicating skill instructions.
- Slice artifacts should stay compatible with the skills that generate them.
- Process changes should usually happen in the skills first, with docs updated only where the visible workflow changes.
- Slice completion includes an explicit post-implementation architecture review step.

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

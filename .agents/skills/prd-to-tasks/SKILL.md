---
name: prd-to-tasks
description: Break a PRD into independently-grabbable tasks using tracer-bullet vertical slices. Use when user wants to convert a PRD to tasks, create implementation tickets, or break down a PRD into work items.
---

# PRD to tasks

Break a PRD into independently-grabbable tasks using vertical slices (tracer bullets).

This skill defines the implementation tasks for a slice and should also include slice closeout work.

## Process

### 1. Locate the PRD

Ask the user for the PRD file.

If the PRD is not already in your context window, read it.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code.

### 3. Draft vertical slices

Break the PRD into **tracer bullet** tasks. Each task is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
</vertical-slice-rules>

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Status**: todo / in progress / complete
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories from the PRD this addresses

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?

Iterate until the user approves the breakdown.

### 5. Create the tasks

The tasks should live in a file in a path like `docs/slices/*feature*/TASKS.md`.

Create tasks in dependency order (blockers first) so you can reference real tasks numbers in the "Blocked by" field.

Always include a final slice-closeout task that runs an architecture review after the implementation tasks are complete.

That closeout task should:

- run `improve-codebase-architecture` on the completed slice
- capture accepted refactors as follow-up tasks in the same `TASKS.md` file or as ADR updates when appropriate
- keep the slice open until the architecture review is complete or explicitly deferred

<task-template>
# <prd-task-number>

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation. Reference specific sections of the parent PRD rather than duplicating content.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- Blocked by #<task-number> (if any)

Or "None - can start immediately" if no blockers.

## User stories addressed

Reference by number from the parent PRD:

- User story 3
- User story 7

</task-template>

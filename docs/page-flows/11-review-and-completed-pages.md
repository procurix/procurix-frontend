# Review And Completed Pages

Routes:

- `/review`
- `/completed`

Frontend sources:

- `src/app/pages/review/ReviewPage.tsx`
- `src/app/pages/completed/CompletedPage.tsx`

Backend sources:

- summary/read APIs used by review components
- finalization endpoints if present

## Purpose

Review is the final cross-stage summary. Completed is the terminal state/landing
view for a finished design.

## Entry Conditions

Expected backend state:

- `subsystems_defined`
- or `complete`

## Data Reads

Final review should read:

- design metadata
- parts
- system profile
- classification
- enrichment/model status
- validation summary
- requirements and traceability
- architecture connections and nets
- subsystems

## Data Writes

Potential final actions:

- mark workflow complete
- export report
- duplicate/restart design

Exact available actions should be reviewed against the current UI.

## Page Lifecycle

1. Resolve session.
2. Load cross-stage summary.
3. Show outstanding blockers or completion state.
4. User exports, reviews, or starts a new design.

## State Transitions

- `subsystems_defined` -> `complete`

## CRUD Sequence

1. Read summary data.
2. Optional update: mark complete.
3. Optional export actions.

## Guardrails

- Final review must not hide unresolved critical blockers.
- Export should use persisted backend state, not transient graph/UI state.
- Completed page should not mutate workflow state on mere page load.

## Review Notes

- `/review` currently exists in routing but StageIndicator maps the review stage
  to `/completed`. This should be clarified as either separate pages or one
  terminal route.


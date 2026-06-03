# Library Page

Route: `/`

Frontend sources:

- `src/app/pages/library/LibraryPage.tsx`
- `src/app/services/api.ts`

Backend sources:

- `GET /api/designs`
- `design_evolution_api_v2/routes/designs.py`

## Purpose

The Library page is the design/session picker. It lists existing designs and
routes the user to the correct workflow page based on each design's backend
`current_stage`.

## Data Reads

On mount:

- `GET /api/designs`

The frontend maps each design into:

- `bom_id`
- `project_name`
- `current_stage`
- `created_at`

## Data Writes

None during normal browse.

Starting a new design routes to `/upload` with no session. It does not mutate the
backend until the Upload page creates a design.

## Page State

Local state tracks:

- design list
- stage map per design
- loading/error state

Session context is set only when a user selects a design.

## Navigation Logic

When a user opens an existing design:

1. Set `sessionId` in context.
2. Set `currentStage` from the design's backend `current_stage`.
3. Convert stage number to route using `getStageForNumber`.
4. Navigate to that route with `?session={design_id}`.

## CRUD Sequence

Open existing design:

1. Read: `GET /api/designs`
2. User selects row/card.
3. Context update: `sessionId`, `currentStage`
4. Navigate to derived route.

Start new design:

1. Clear session state.
2. Navigate to `/upload`.
3. No backend write yet.

## Guardrails

- Library should never infer route from stale localStorage alone.
- Backend `current_stage` should always win over frontend stage guesses.
- Completed designs route to `/completed`.

## Review Notes

- The list currently uses design-level stage only; it does not display blockers
  in detail.
- If a design appears stuck, inspect `fsm_state` and `current_stage` returned by
  `GET /api/designs`.


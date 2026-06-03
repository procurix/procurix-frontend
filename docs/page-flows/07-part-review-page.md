# Part Review Page

Route: `/validate`

Frontend sources:

- `src/app/pages/validate/validatePage.tsx`
- `src/app/pages/validate/components/validationView.tsx`

Backend sources:

- `GET /api/designs/{design_id}/validation`
- `POST /api/designs/{design_id}/parts/review/confirm`
- `routes/validation.py`
- `routes/part_confirm.py`

## Purpose

Review enriched/validated parts before generating requirements. This is the
human checkpoint that confirms the enriched part set is acceptable.

## Entry Conditions

Expected backend state:

- `enriched`
- or later states when revisiting

## Data Reads

- `GET /validation`
- current stage through layout/session

Validation rows include:

- validity status
- unresolved issues
- classification
- manufacturer/category/description
- datasheet URL
- params
- extraction/model status

## Data Writes

Confirm part review:

- `POST /parts/review/confirm`

Backend allowed states:

- `enriched`
- `validated`
- later downstream states for idempotency/revisit support

Successful confirmation advances FSM to:

- `validated`

## Page Lifecycle

1. Load validation results.
2. Show ready vs needs-attention parts.
3. User reviews unresolved parts.
4. User confirms all reviewed parts.
5. Navigate to Requirements.

## State Transitions

- `enriched` -> `validated`

## CRUD Sequence

1. Read: `GET /validation`
2. Update: `POST /parts/review/confirm`
3. Read: `GET /designs/{id}` to refresh current stage
4. Navigate to `/requirements`

## Guardrails

- Confirmation should be blocked if enrichment is not complete.
- Confirmation should not be auto-triggered by page load.
- User must explicitly accept unresolved risk if unresolved parts remain.

## Review Notes

- This page is the boundary between component evidence and requirements.
- If later stages behave poorly, verify that the design really passed this page
  with `fsm_state = validated`.


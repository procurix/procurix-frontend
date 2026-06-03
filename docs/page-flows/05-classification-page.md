# Classification Page

Route: `/classification`

Frontend sources:

- `src/app/pages/classification/ClassificationPage.tsx`
- `src/app/pages/fundamental/components/FundamentalClassificationView.tsx`

Backend sources:

- `GET /api/designs/{design_id}/classification/stream`
- `GET /api/designs/{design_id}/classification`
- `PUT /api/designs/{design_id}/classification/bulk`
- `routes/classification.py`
- `activities/classify_parts.py`

## Purpose

Classify identified parts as auxiliary or non-auxiliary, then let the user review
and adjust classifications before enrichment.

## Entry Conditions

Expected backend state:

- `system_type_confirmed`
- or `classified` when revisiting

## Data Reads

- `GET /classification`
- Optional current stage fetch through layout/session.

## Data Writes

Trigger classification:

- `GET /classification/stream`
- `POST /pipeline/classify` is retired and returns `410 Gone` to prevent duplicate LLM runs.

Bulk edit classifications:

- `PUT /classification/bulk`
- Body contains `{ mpn, new_classification }[]`.

## Page Lifecycle

1. Load existing classification if present.
2. If not present, open the classification SSE stream.
3. Stream part replay and classification results.
4. Show non-auxiliary/auxiliary grouping.
5. User can edit classifications.
6. Save bulk edits.
7. Navigate to Enrichment.

## State Transitions

- `system_type_confirmed` -> `classified`

## CRUD Sequence

1. Read: `GET /classification`
2. Create/update through canonical stream: `GET /classification/stream`
3. Read final persisted results
4. Update: `PUT /classification/bulk`
5. Navigate to `/enrichment`

## Guardrails

- Classification edits should be persisted before navigation.
- User edits should override AI classification on rerun unless explicitly
  regenerated.
- Classification must operate on confirmed/resolved part identities.

## Review Notes

- There is legacy naming overlap: the component lives under
  `pages/fundamental`, but the active route is `/classification`.
- The docs should treat this as a separate workflow page despite shared legacy
  folder structure.

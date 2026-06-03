# Part Identification Page

Route: `/part-identification`

Frontend sources:

- `src/app/pages/fundamental/FundamentalPage.tsx`
- `src/app/pages/fundamental/components/PartIdentificationView.tsx`

Backend sources:

- `POST /api/designs/{design_id}/pipeline/identify/stream`
- `GET /api/designs/{design_id}/parts`
- `GET /api/designs/{design_id}/parts/specs`
- `POST /api/designs/{design_id}/parts/{mpn}/select-match`
- `POST /api/designs/{design_id}/parts/{mpn}/web-confirm`
- `POST /api/designs/{design_id}/parts/{mpn}/custom`
- `services/part_identification_stream.py`
- `activities/identify_parts.py`
- `routes/part_confirm.py`

## Purpose

Identify every distinct BOM part, surface uncertain matches for review, and
require explicit user approval before System Identification.

## Entry Conditions

Expected backend state:

- `bom_uploaded`
- or `parts_identified` with reviewable saved state
- or later states when revisiting for audit/review

The page must preserve review if saved part evidence exists.

## Data Reads

On mount:

1. `GET /api/designs/{id}` via `getCurrentStage`
2. `GET /api/designs/{id}/parts`
3. `GET /api/designs/{id}/parts/specs`

The page first attempts to build saved review state from persisted backend data.
If saved state exists, it shows review instead of re-running identification.

## Identification Stream

If no saved review state exists:

`POST /api/designs/{id}/pipeline/identify/stream`

Backend algorithm:

1. Snapshot design parts.
2. Group by distinct `selected_mpn || mpn`.
3. For each group:
   - check `part_catalog` cache
   - lookup Datasheets.com
   - lookup Nexar
   - merge exact Datasheets/Nexar result when available
   - store catalog data
   - update all matching design part instances
   - else surface candidates as `web_unresolved`
   - else mark `not_found`
4. Set FSM to `parts_identified`.
5. Emit final `complete` event.

SSE event types:

- `start`
- `searching`
- `found`
- `web_found`
- `not_found`
- `complete`

After `complete`, frontend reloads canonical persisted state from:

- `GET /parts`
- `GET /parts/specs`

This is required so review cards show full catalog evidence, not only thin SSE
event payloads.

## Review Data Model

Identified parts:

- `identification_status` in `identified`, `web_confirmed`, `custom`,
  `user_provided`

Needs action:

- `web_unresolved`
- `not_found`

Specs source:

- `part_catalog`
- `PartModel` when already extracted
- design custom part fields when custom data exists

Review card requirement:

- Expanded identified cards must show technical specs returned during
  identification from `part_catalog.params`.
- If structured params are absent, the card must say that no structured
  technical specs were returned yet instead of silently hiding the section.
- The card must still show identity evidence: source, manufacturer, category,
  description, datasheet link, product link, function, and topology family.

## User Actions

Select alternate match:

- `POST /parts/{mpn}/select-match`
- Writes selected MPN and `identification_status = identified`.

Confirm web candidate:

- `POST /parts/{mpn}/web-confirm`
- Writes or appends catalog contribution.
- Marks design parts `web_confirmed`.
- Background task may backfill Nexar params.

Create custom part:

- `POST /parts/{mpn}/custom`
- Writes design-scoped custom part.
- Marks design parts `custom`.

Refresh cached part from Nexar:

- On-card re-identify button.
- Updates display with fresher catalog data.

## Exit Criteria

All web-found parts must either be:

- confirmed
- manually entered
- intentionally skipped into custom entry with data

Then user clicks approve/continue.

Frontend navigates to System Identification. Backend stage availability is
controlled by `current_stage` and blocker count.

## CRUD Sequence

Initial identification:

1. Read: `GET /designs/{id}`
2. Read: `GET /parts`
3. Read: `GET /parts/specs`
4. Create/update stream: `POST /pipeline/identify/stream`
5. Update: design part statuses and catalog rows during stream
6. Read again: `GET /parts`, `GET /parts/specs`

Review:

1. Optional update: `select-match`
2. Optional update: `web-confirm`
3. Optional create/update: `custom`
4. Navigate to `/system-identification`

## Guardrails

- Do not skip the review screen just because `current_stage >= 3` if saved
  review state exists.
- Do not show only SSE payload in final review; always rehydrate from backend.
- Do not let LLM silently invent part identity.
- Cache/Nexar/Datasheets can identify; web candidates require human action.

## Review Notes

- Natural-language BOM labels can be dangerous if treated as exact MPNs.
- The UI should make source and evidence visible: source, manufacturer,
  category, description, datasheet/product links, params, and model status.

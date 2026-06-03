# Enrichment Page

Route: `/enrichment`

Frontend sources:

- `src/app/pages/enrichment/EnrichmentPage.tsx`
- `src/app/pages/enrichment/components/EnrichmentView.tsx`

Backend sources:

- `POST /api/designs/{design_id}/pipeline/enrich`
- `GET /api/designs/{design_id}/parts/specs`
- `GET /api/designs/{design_id}/parts/{mpn}/model`
- `POST /api/designs/{design_id}/parts/{mpn}/model/extract`
- `routes/enrichment.py`
- `routes/parts.py`
- `activities/model_extraction.py`

## Purpose

Extract and monitor part models, pinouts, interfaces, power domains, and richer
technical metadata needed by validation, requirements, and architecture.

## Entry Conditions

Expected backend state:

- `classified`
- or `enriching`
- or `enriched`

## Data Reads

- `GET /parts/specs`
- per-part model/pinout endpoints
- current stage through `GET /designs/{id}`

## Data Writes

Trigger batch enrichment:

- `POST /pipeline/enrich`

Trigger single part extraction:

- `POST /parts/{mpn}/model/extract`

Provide/replace datasheet URL:

- enrichment-specific route paths in `routes/enrichment.py`

## Page Lifecycle

1. Load current part specs/model status.
2. If models or datasheet URLs are missing, trigger enrichment even when the
   design is revisiting an already-enriched stage.
3. Poll model extraction status.
4. Allow user to re-identify/re-extract parts with missing or poor model data.
5. When enrichment is complete, navigate to Part Review.

## State Transitions

- `classified` -> `enriching`
- `enriching` -> `enriched`
- `classified` -> `enriched` when nothing needs enrichment

## CRUD Sequence

1. Read: `GET /designs/{id}`
2. Read: `GET /parts/specs`
3. Create/update: `POST /pipeline/enrich`
4. Read/poll: model/pinout/spec endpoints
5. Optional update: submit replacement datasheet or re-extract
6. Navigate to `/validate`

## Guardrails

- Do not overwrite manually corrected model data without confirmation.
- Parts with no URL must first be queued for automatic URL resolution. Backend
  uses `part_catalog.datasheet_source = resolving` while this is in progress.
- If automatic URL resolution cannot find a PDF, backend records
  `datasheet_source = not_found`; the UI then shows the Add URL path without
  repeatedly re-queueing the same unresolved part.
- Extraction failures should be visible, not silently treated as complete.
- Sync storage/client calls should be wrapped in async-safe adapters.
- Enrichment state must survive refresh.

## Review Notes

- Enrichment is long-running and can be eventually moved to dedicated Temporal
  orchestration if needed.
- The current UX should clearly separate "queued", "running", "extracted",
  "failed", and "not available".

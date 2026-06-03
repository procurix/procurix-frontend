# Upload Page

Route: `/upload`

Frontend sources:

- `src/app/pages/upload/UploadPage.tsx`
- `src/app/pages/upload/components/UploadView.tsx`

Backend sources:

- `POST /api/designs`
- `POST /api/designs/{design_id}/bom`
- `design_evolution_api_v2/routes/designs.py`
- `design_evolution_api_v2/services/stage_runner.py`
- `activities/upload.py`

## Purpose

Upload creates a new design and persists BOM rows. It should not run part
identification in the background. After BOM persistence succeeds, it immediately
navigates to Part Identification.

## Entry Conditions

Fresh upload:

- URL has no `?session`.
- Upload page clears session context and upload data.

Existing guarded upload:

- URL has `?session`.
- Upload page preserves that session instead of clearing it.

## Data Writes

### Create Design

`POST /api/designs`

Payload:

- `project_name`
- optional `user_id`

Result:

- design row created with `fsm_state = empty`

### Persist BOM

`POST /api/designs/{design_id}/bom`

Payload:

- uploaded CSV/XLS/XLSX file

Backend behavior:

1. Reads file content.
2. Parses BOM with deterministic parser or LLM column mapper fallback.
3. Persists parsed parts synchronously via `stage_runner.persist_bom_upload`.
4. Writes `design_parts`.
5. Advances FSM to `bom_uploaded`.
6. Returns only after DB is ready.

Important: upload does not start `DesignIngestionWorkflow`.

## Data Reads

No separate `/parts` fetch should happen on upload success. The next page owns
part identification and part review data.

## Frontend Lifecycle

1. User selects/drops file.
2. `createDesign(projectName)` runs.
3. `uploadBOM(designId, file)` runs and waits for persistence.
4. Set session context.
5. Update URL params.
6. Set `currentStage = fsmToStage('bom_uploaded')`.
7. Call `onUploadComplete`.
8. Navigate to `/part-identification?session={designId}`.

## Exit Criteria

Successful `/bom` response with:

- `fsm_state = bom_uploaded`
- `part_count`

Then navigate to Part Identification.

## CRUD Sequence

1. Create: `POST /api/designs`
2. Create/update: `POST /api/designs/{id}/bom`
3. Frontend state update
4. Navigate to `/part-identification?session={id}`

## Guardrails

- Do not fetch `/parts` on this page after upload.
- Do not trigger identification on this page.
- Do not start Temporal ingestion from upload.
- Do not advance UI to Part Identification before `/bom` returns.

## Review Notes

- If the user remains on Upload while backend identification is running, an old
  server process or old Temporal workflow may still be active.
- Test fresh designs after backend/frontend reload.


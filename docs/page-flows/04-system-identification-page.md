# System Identification Page

Route: `/system-identification`

Frontend sources:

- `src/app/pages/analysis/AnalysisPage.tsx`
- `src/app/pages/analysis/components/AnalysisView.tsx`

Backend sources:

- `POST /api/designs/{design_id}/pipeline/analyze`
- `GET /api/designs/{design_id}/system-profile`
- `POST /api/designs/{design_id}/system-profile/confirm`
- `routes/analysis.py`
- `activities/analyze_system.py`

## Purpose

Infer the system/application type from identified parts, propose likely
standards, and require user confirmation before classification.

## Entry Conditions

Expected backend state:

- `parts_identified`
- or `system_analyzed`
- or revisiting after `system_type_confirmed`

Part Identification review blockers should keep `current_stage = 2`, preventing
this page from being reached through normal guarded navigation.

## Data Reads

On mount:

1. `GET /api/designs/{id}` through `getCurrentStage`
2. `GET /api/designs/{id}/system-profile`

If a confirmed profile exists, UI can show it and allow continue.

## Data Writes

Trigger analysis:

- `POST /api/designs/{id}/pipeline/analyze`
- Optional body: `additional_context`

Confirm system type:

- `POST /api/designs/{id}/system-profile/confirm`
- Stores selected system type and standards.
- Advances FSM to `system_type_confirmed`.

## Page Lifecycle

1. Resolve session from URL/context.
2. Fetch current backend stage.
3. Try to load existing system profile.
4. If no profile exists, trigger analysis.
5. Display suggestions with confidence and reasoning.
6. User selects/confirms one.
7. Navigate to Classification.

## State Transitions

Possible transitions:

- `parts_identified` -> `system_analyzed`
- `system_analyzed` -> `system_type_confirmed`

## CRUD Sequence

1. Read: `GET /designs/{id}`
2. Read: `GET /system-profile`
3. Create/update: `POST /pipeline/analyze`
4. Read/poll: `GET /system-profile`
5. Update: `POST /system-profile/confirm`
6. Navigate to `/classification`

## Guardrails

- Analysis can propose; user must confirm.
- Green/complete state in the stage indicator should mean confirmed, not merely
  suggested.
- Page should not auto-advance on suggestions alone.
- If `GET /system-profile` returns `confirmed=false`, the page remains in
  review/selection mode.

## Review Notes

- The page includes chat/tool integration for system profile changes.
- If System Identification appears green before user confirmation, inspect
  `system-profile.confirmed` and backend `fsm_state`.


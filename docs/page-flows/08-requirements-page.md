# Requirements Page

Route: `/requirements`

Frontend sources:

- `src/app/pages/requirements/RequirementsPage.tsx`
- `src/app/pages/requirements/components/RequirementsView.tsx`
- `src/app/pages/requirements/hooks/useRequirementsData.ts`
- `src/app/pages/requirements/hooks/useRequirementActions.ts`

Backend sources:

- `POST /api/designs/{design_id}/requirements/generate`
- `GET /api/designs/{design_id}/requirements`
- `POST /api/designs/{design_id}/requirements/{req_id}/confirm`
- `POST /api/designs/{design_id}/requirements/confirm-all`
- `routes/requirements.py`
- `activities/build_requirements.py`

## Purpose

Generate, edit, trace, and approve requirements derived from the system type,
standards, parts, and architecture context.

## Entry Conditions

Expected backend state:

- `validated`
- or `requirements_generated` when revisiting

## Data Reads

- `GET /requirements`
- traceability/coverage endpoints
- current stage through layout/session

## Data Writes

Generate requirements:

- `POST /requirements/generate`

Edit/update requirement:

- requirement action endpoints in `routes/requirements.py`

Confirm single requirement:

- `POST /requirements/{req_id}/confirm`

Confirm all:

- `POST /requirements/confirm-all`

## Page Lifecycle

1. Load existing requirements.
2. If none exist and state allows, generate requirements.
3. Show requirements grouped/filterable by status.
4. User edits, confirms, rejects, or requests evidence.
5. Confirm all required/critical requirements.
6. Navigate to Architecture.

## State Transitions

- `validated` -> `requirements_generated`

## CRUD Sequence

1. Read: `GET /requirements`
2. Create/update: `POST /requirements/generate`
3. Update: requirement edit/confirm/reject endpoints
4. Update: `POST /requirements/confirm-all`
5. Navigate to `/architecture`

## Guardrails

- Requirements generation is blocked before Part Review confirmation.
- AI-generated requirements should start as reviewable suggestions.
- User-confirmed requirements should not be silently overwritten by reruns.
- Traceability gaps should remain visible.

## Review Notes

- Requirements are both user-facing review objects and downstream context for
  architecture, subsystems, and assistant behavior.
- Confirmed/rejected status is meaningful and should be preserved.


# Page Flow Design Docs

Last updated: 2026-05-28

These documents describe the current page-by-page product flow, data ownership,
API calls, FSM transitions, and review guardrails for the BOM Evolution Platform.

The backend DB FSM is the source of truth. The frontend `current_stage` is a
derived unlock number returned by `GET /api/designs/{design_id}` and used by the
route guard/stage indicator.

## Docs

1. [Workflow State Machine](./00-workflow-state-machine.md)
2. [Library Page](./01-library-page.md)
3. [Upload Page](./02-upload-page.md)
4. [Part Identification Page](./03-part-identification-page.md)
5. [System Identification Page](./04-system-identification-page.md)
6. [Classification Page](./05-classification-page.md)
7. [Enrichment Page](./06-enrichment-page.md)
8. [Part Review Page](./07-part-review-page.md)
9. [Requirements Page](./08-requirements-page.md)
10. [Architecture Page](./09-architecture-page.md)
11. [Subsystems Page](./10-subsystems-page.md)
12. [Review And Completed Pages](./11-review-and-completed-pages.md)
13. [Chat Assistant Page](./12-chat-assistant-page.md)
14. [Database Models](./13-database-models.md)
15. [Page To Database Model Matrix](./14-page-to-db-model-matrix.md)

## Main Source Files

Frontend:

- `src/app/App.tsx`
- `src/app/shared/components/Layout.tsx`
- `src/app/shared/components/StageIndicator.tsx`
- `src/app/shared/utils/workflowStages.ts`
- `src/app/services/api.ts`

Backend:

- `design_evolution_api_v2/domain/enums.py`
- `design_evolution_api_v2/services/workflow_progress.py`
- `design_evolution_api_v2/routes/designs.py`
- `design_evolution_api_v2/services/stage_runner.py`

## Review Lens

When reviewing a page, check:

- Is the page reading only the data it owns?
- Is mutation routed through a backend domain route/service instead of local-only state?
- Is the next page unlocked by backend FSM, not optimistic UI state?
- Are human review decisions explicit before advancing?
- Is there a clear recovery behavior on refresh/reload?
- Is AI allowed to propose, but not silently overwrite confirmed user work?

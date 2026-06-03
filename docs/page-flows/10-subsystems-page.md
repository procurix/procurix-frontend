# Subsystems Page

Route: `/subsystems`

Frontend sources:

- `src/app/pages/subsystems/SubsystemsPage.tsx`
- `src/app/pages/subsystems/components/SubsystemsView.tsx`
- `src/app/pages/subsystems/components/SubsystemDiagramView.tsx`
- `src/app/pages/subsystems/components/SubsystemsFlowView.tsx`

Backend sources:

- subsystem routes and services in `design_evolution_api_v2/routes`
- architecture/requirements/classification APIs used as context

## Purpose

Group parts, requirements, and architecture connections into higher-level
subsystems for system engineering review.

## Entry Conditions

Expected backend state:

- `connections_built`
- or `subsystems_defined` when revisiting

## Data Reads

Typical inputs:

- parts/classification
- requirements
- architecture connections
- nets
- existing subsystem definitions

## Data Writes

Expected subsystem operations:

- create subsystem
- update subsystem metadata
- add/remove part members
- add/remove requirement links
- confirm subsystem set

Exact route coverage should be reviewed against current backend implementation.

## Page Lifecycle

1. Resolve session.
2. Load components, requirements, architecture connections, and subsystem data.
3. Render subsystem view/diagram.
4. User edits groupings and subsystem relationships.
5. User completes subsystem review.
6. Navigate to completed/review page.

## State Transitions

- `connections_built` -> `subsystems_defined`
- or `connections_built` -> `complete` if subsystem step is collapsed in a
  future product decision.

## CRUD Sequence

1. Read context data.
2. Create/update subsystem definitions.
3. Confirm subsystem review.
4. Navigate to `/completed`.

## Guardrails

- Subsystems should reference persisted part IDs/requirements/connections, not
  duplicate their data.
- AI-proposed subsystem groupings should be reviewable before persistence.
- User-edited subsystem memberships should not be overwritten by reruns.

## Review Notes

- This page likely needs the same first-class persistence rigor as nets:
  explicit entities, explicit membership tables, and audit logging.


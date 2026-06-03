# Architecture Page

Route: `/architecture`

Frontend sources:

- `src/app/pages/architecture/ArchitecturePage.tsx`
- `src/app/pages/architecture/components/SystemArchitectureView.tsx`
- `src/app/pages/architecture/utils/architectureNetModel.ts`
- `src/app/pages/architecture/utils/connectionMapping.ts`
- `src/app/pages/architecture/utils/manhattanRouting.ts`

Backend sources:

- `POST /api/designs/{design_id}/connections/analyze`
- `GET /api/designs/{design_id}/connections`
- `POST /api/designs/{design_id}/connections`
- `PUT /api/designs/{design_id}/connections/{connection_id}`
- `DELETE /api/designs/{design_id}/connections/{connection_id}`
- `POST /api/designs/{design_id}/connections/resolve-pins`
- `GET /api/designs/{design_id}/nets`
- net CRUD routes under `/nets`
- `routes/connections.py`
- `routes/nets.py`
- `services/connection_inference.py`
- `services/pin_resolution.py`
- `services/net_management.py`

## Purpose

Predict, render, and review architecture connections between parts at component,
pin, and net level. Persist real architecture nets so reloads are deterministic.

## Entry Conditions

Expected backend state:

- `requirements_generated`
- or `connections_built` when revisiting

## Data Reads

On page load:

- `GET /connections`
- `GET /classification`
- `GET /parts/specs`
- `GET /parts/pinouts`
- `GET /connections/review-status`
- `GET /nets`

## Data Writes

Analyze/build connections:

- `POST /connections/analyze`

Resolve pins:

- `POST /connections/resolve-pins`
- `POST /connections/{connection_id}/resolve-pins`

Manual connection create:

- `POST /connections`

Manual connection edit:

- `PUT /connections/{connection_id}`

Delete individual connection:

- `DELETE /connections/{connection_id}`

Confirm all architecture:

- `POST /connections/confirm-all`

Net CRUD:

- `GET /nets`
- `POST /nets`
- `PUT /nets/{net_id}`
- `DELETE /nets/{net_id}?mode=ungroup|delete_links|move`
- `POST /nets/{net_id}/members`
- `DELETE /nets/{net_id}/members/{connection_id}`
- `POST /nets/merge`
- `POST /nets/{net_id}/split`
- `PUT /nets/{net_id}/layout`
- `POST /nets/{net_id}/confirm`
- `POST /nets/{net_id}/reject`

## Backend Inference Design

Component-level connection inference:

1. Deterministic compatible-with category matching.
2. Power-domain voltage overlap.
3. LLM fallback/validation for complex interfaces.
4. Persist reviewed connections in `design_connections`.

Pin-level resolution:

1. Deterministic pin matching from signal name, connection type, and pin lists.
2. Alias maps for common protocols/power/ground.
3. LLM fallback only for unresolved/ambiguous mappings.
4. User-corrected pins are sacred and must not be overwritten.

Net persistence:

- Existing `nets` table is canonical.
- `design_connections.net_id` links connections to nets.
- Frontend-generated grouping is fallback only for unmigrated data.

## Frontend Graph Design

The backend schema does not directly leak into React Flow. The page builds a
graph view model:

- parts become nodes
- active pins become handles
- nets become net nodes
- persisted connections become edges
- connection data maps through utility functions

Rendering concepts:

- Only active pins should render when minimized.
- Expanded components show all pinout/spec detail.
- Manual pin-to-pin create should persist immediately.
- Edge editor can change pins, metadata, style, and delete the connection.
- Nets have inspector controls for rename/type/member/status/layout.

## Routing/Layout Design

Current routing strategy:

- ELK provides node placement.
- Custom deterministic Manhattan routing handles edge paths.
- Route classifier separates:
  - direct part-to-part
  - part-to-net
  - net-to-part
- Same source/target pairs use bundled lanes.
- Pin handles compute escape direction from pin side.

## State Transitions

- `requirements_generated` -> `connections_built`

Architecture completion should require reviewed/confirmed critical connections
and nets.

## CRUD Sequence

Initial load:

1. Read connections/classification/specs/pinouts/nets.
2. If no connections, trigger analysis.
3. Resolve pins for unresolved connections as needed.
4. Build graph view model.

Manual edit:

1. User creates/edits/deletes edge or net.
2. Persist via direct API.
3. Update local graph model.
4. Refresh from backend if needed.

Complete:

1. Confirm all connections/nets.
2. Backend advances FSM.
3. Navigate to `/subsystems`.

## Guardrails

- User-corrected connections, pins, and nets must not be overwritten.
- LocalStorage layout is dev fallback only; persisted net layout is production.
- Delete net default should ungroup, not delete member links.
- Delete links must be explicit and dangerous.
- Edge editor delete should delete the individual connection, not only the net.

## Review Notes

- Architecture is the heaviest page and most sensitive to local-only state.
- Any graph item the user can edit should have a backend entity or a clear
  fallback story.


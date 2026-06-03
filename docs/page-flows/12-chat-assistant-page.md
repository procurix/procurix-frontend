# Chat Assistant Page

Route: `/chat`

Frontend sources:

- `src/app/pages/chat/ChatConsolePage.tsx`
- `src/app/shared/components/ChatDrawer.tsx`

Backend sources:

- chat/copilot routes
- page context APIs

## Purpose

Provide an AI assistant that is aware of the current design and workflow stage.
The assistant explains, suggests, and prepares changes, but should not silently
mutate confirmed architecture or review decisions.

## Entry Conditions

Any design session with `?session={id}`.

The chat can also be opened as a drawer from most workflow pages except pages
with their own embedded chat/console behavior.

## Data Reads

Context can include:

- current design
- current FSM/current_stage
- parts and catalog specs
- system profile
- classification
- requirements
- architecture connections/nets/pins
- selected UI object when embedded in a page

## Data Writes

Assistant actions should be mediated through explicit tools/routes.

Allowed pattern:

1. Assistant proposes a patch/action.
2. User reviews.
3. User confirms.
4. Backend mutation route runs.

Not allowed:

- silently changing confirmed user edits
- overwriting `user_corrected=true`
- advancing human review gates without explicit user confirmation

## Page Lifecycle

1. Resolve session.
2. Load current workflow context.
3. User asks a question or requests an action.
4. Assistant responds with explanation or proposed patch.
5. If user accepts, call explicit backend route.
6. Refresh relevant page data.

## Guardrails

- AI is advisory by default.
- User edits are sacred.
- For architecture, assistant should propose net/pin/connection corrections as
  reviewable patches.
- For parts, assistant should rank/explain evidence rather than inventing
  identity.

## Review Notes

- The assistant should use the same typed API functions as the page, not special
  hidden mutation paths.
- Page-specific assistant context should be explicit so responses remain
  grounded.


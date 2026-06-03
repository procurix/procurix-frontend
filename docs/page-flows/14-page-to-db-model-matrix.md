# Page To Database Model Matrix

This matrix connects the page design docs to the V2 backend database models.
Use it to verify that each transition has a clear CRUD sequence and that refresh
reloads from the correct source of truth.

## Global Rule

`designs.fsm_state` is the workflow source of truth. Pages may show local
progress while a request is running, but unlock/redirect decisions must be based
on the backend-derived `current_stage`.

## Matrix

| Page | Primary reads | Primary writes | Canonical tables | Exit state |
| --- | --- | --- | --- | --- |
| Library | list designs | create/open design | `designs` | unchanged |
| Upload | design shell | create design, upload BOM | `designs`, `design_parts` | `bom_uploaded` |
| Part Identification | design, parts, specs | update part identity/status, catalog cache | `design_parts`, `part_catalog`, `design_custom_parts` | `parts_identified` |
| System Identification | design, parts, system profile | analyze/confirm system and standards | `system_profile`, `design_standards`, `designs` | `system_type_confirmed` |
| Classification | design, parts, specs | classify part roles/functions | `design_parts`, `part_catalog` | `classified` |
| Enrichment | design, parts, specs, models | extract/update models, pinouts, references | `part_catalog`, `part_pinout`, `part_model`, `part_reference_designs` | `enriched` |
| Part Review | design, parts, specs, models | review/accept final part data | `design_parts`, `part_catalog`, `part_model`, `part_pinout` | `validated` |
| Requirements | design, profile, standards, parts | generate/edit/confirm requirements | `requirements`, `requirement_parts`, `requirement_sources`, `requirement_history`, `requirement_proposals` | `requirements_generated` |
| Architecture | parts, specs, pinouts, connections, nets | infer/edit/delete connections and nets | `design_connections`, `nets`, `architecture_proposals`, `part_pinout`, `part_model` | `connections_built` |
| Subsystems | parts, nets, connections, requirements | define/edit subsystems and interfaces | `subsystems`, `subsystem_parts`, `subsystem_interfaces`, `subsystem_constraints`, `subsystem_standards`, `subsystem_requirements` | `subsystems_defined` |
| Review/Complete | all stage summaries | final confirmation | mostly read-only, plus `designs` | `complete` |
| Chat Assistant | page context, design facts, history | append messages/proposals | `chat_history`, proposal tables by page | unchanged unless applying proposal |

## Page CRUD Detail

### Library

Reads:

- `designs`

Writes:

- `designs` on new design.

Reliability check:

- Opening an existing design should route based on `designs.fsm_state`, not the
  last frontend page stored in memory.

### Upload

Reads:

- optional existing `designs` row when resuming.

Writes:

- `designs`: creates or updates project metadata.
- `design_parts`: creates BOM part instances.

Reliability check:

- After BOM upload returns accepted, navigate to Part Identification.
- Do not require a frontend `/parts` read before navigation.
- Do not start identification implicitly from upload unless the route contract
  explicitly says so.

### Part Identification

Reads:

- `designs`
- `design_parts`
- `part_catalog`
- `design_custom_parts`

Writes:

- `design_parts.identification_status`
- `design_parts.selected_mpn`
- `design_parts.suggestions_json`
- `design_parts.resolved_at`
- `part_catalog` cache rows
- `design_custom_parts` for custom entries

Reliability check:

- After the SSE stream completes, the UI must reload `GET /parts` and
  `GET /parts/specs` so cards show full catalog details.
- `identified` should mean reviewable with evidence, not just "seen in SSE".

### System Identification

Reads:

- `designs`
- `design_parts`
- `part_catalog`
- `system_profile`

Writes:

- `system_profile.suggestions` during analysis.
- `system_profile.system_type`, standards, and `confirmed_at` on confirmation.
- `design_standards`.
- `designs.fsm_state` through backend transition service.

Reliability check:

- The stage badge should only show done after confirmed system type and standards
  are persisted.
- `/pipeline/analyze` should return a blocker response if part identification is
  incomplete.

### Classification

Reads:

- `design_parts`
- `part_catalog`
- `part_model` when available.

Writes:

- `design_parts.classification`
- `design_parts.component_id`
- `design_parts.instance_function`
- `design_parts.category` if normalized.

Reliability check:

- Reclassification should be explicit because it can affect downstream
  architecture and subsystem inference.

### Enrichment

Reads:

- `design_parts`
- `part_catalog`

Writes:

- `part_catalog` technical fields and datasheet metadata.
- `part_model`
- `part_pinout`
- `part_reference_designs`

Reliability check:

- Long-running work belongs in Temporal/stage runner.
- Sync storage/network calls must not block async routes directly.

### Part Review

Reads:

- `design_parts`
- `part_catalog`
- `part_pinout`
- `part_model`
- `part_reference_designs`

Writes:

- review/confirmation state where implemented.
- `designs.fsm_state` to `validated` only after required review is satisfied.

Reliability check:

- Do not advance simply because enrichment exists; the user must have a chance to
  review final technical data.

### Requirements

Reads:

- `system_profile`
- `design_standards`
- `design_parts`
- `part_catalog`
- `part_model`

Writes:

- `requirements`
- `requirement_parts`
- `requirement_sources`
- `requirement_history`
- `requirement_proposals`

Reliability check:

- Requirement edits must write history.
- AI proposals should not mutate canonical requirements until accepted.

### Architecture

Reads:

- `design_parts`
- `part_catalog`
- `part_pinout`
- `part_model`
- `requirements`
- `design_connections`
- `nets`
- `architecture_proposals`

Writes:

- `design_connections`: inferred, manual, edited, rejected/deleted.
- `nets`: create, rename, retype, layout, confirm, reject, ungroup, merge, split.
- `architecture_proposals`: assistant proposals.

Reliability check:

- Manual pin-to-pin edges must persist into `design_connections`.
- Net boxes must persist in `nets`, not only in localStorage.
- Delete individual edge must call `DELETE /connections/{connection_id}`.
- Delete net defaults to ungroup, not delete member connections.

### Subsystems

Reads:

- `design_parts`
- `design_connections`
- `nets`
- `requirements`

Writes:

- `subsystems`
- `subsystem_parts`
- `subsystem_interfaces`
- `subsystem_constraints`
- `subsystem_standards`
- `subsystem_requirements`
- `subsystem_requirement_parts`

Reliability check:

- Subsystems should reference existing design parts and nets instead of copying
  unstable frontend graph state.

### Review And Completed

Reads:

- all canonical stage outputs.

Writes:

- `designs.fsm_state = complete` when final guardrails pass.

Reliability check:

- Completion should fail if critical suggested/unreviewed entities remain.

### Chat Assistant

Reads:

- current page context.
- canonical tables relevant to the selected page.
- `chat_history`.

Writes:

- `chat_history`.
- proposal tables such as `requirement_proposals` or `architecture_proposals`.

Reliability check:

- Assistant can propose changes. Applying a proposal must use the same domain
  services/routes as direct user edits.

## Cross-Cutting Audit Tables

- `workflow_events`: stage progress, complete, and error events.
- `requirement_history`: requirement mutation audit.
- `architecture_proposals`: architecture AI proposal audit.
- `requirement_proposals`: requirement AI proposal audit.
- `chat_history`: assistant conversation context.

## Production Review Questions

- Can this page be refreshed without losing user edits?
- Can this page be opened from Library with no prior frontend memory?
- Does every "green" stage reflect persisted backend state?
- Are proposal rows separate from canonical rows?
- Are confirmed/user-corrected rows protected from regeneration?
- Is the data used by the next page written before navigation?

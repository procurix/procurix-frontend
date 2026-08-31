# Nontechnical Ingestion UI

Routes:

- `/ingestion` → redirects to `/ingestion/inbox`
- `/ingestion/inbox` — work queue (Slice 6)
- `/ingestion/documents` — upload + document list (Slice 2)
- `/ingestion/documents/:documentId` — document workspace (Slices 3–5)
- `/ingestion/vocabulary` — bucket/mention catalogue (Slice 6)

Frontend sources:

- `src/app/pages/ingestion/` — pages, layout shell, hooks
- `src/app/services/api/ingestion.ts` — HTTP client for the consolidated backend

Backend sources (separate service):

- `agent-exmaple/nontechnical_ingestion/manual/backend/` — FastAPI on port **8100**
- Interactive API docs: `http://127.0.0.1:8100/docs`
- Built-in test UI (reference): `http://127.0.0.1:8100/ui`

Environment:

- `VITE_INGESTION_API_URL` — defaults to `http://127.0.0.1:8100`

Portal entry:

- Portal card **Upload supplemental docs** → `/ingestion/documents`

## Purpose

Turn stakeholder spreadsheets (AVL lists, bid sheets, policy docs) into:

1. Reviewed, committed table chunks
2. Design-steering **fact cards** (human-reviewed)
3. **Terms and metrics** mapped to a shared vocabulary (NER buckets)
4. A searchable **catalogue** with full lineage back to source cells

This is separate from the BOM upload flow (`/upload`). BOM ingestion is
technical/part-oriented; this flow is document-oriented and drives the
nontechnical ingestion backend.

## Product framing

**Primary user:** Procurement / SME reviewer who uploads spreadsheets and
steers AI through human review gates.

**Not a developer tool:** The test UI at `/ui` exposes raw JSON batch editing.
Production UI must use structured review panels (cards, tables, steppers).

**Success criteria:**

- Always know what needs attention next (inbox / queue)
- Fix parse errors quickly without breaking downstream work
- Review facts and terms in structured UI, not JSON
- Trace any catalogued term back to the source spreadsheet cell

## Information architecture

```text
Inbox (queue)          Documents (upload + list)       Vocabulary (catalogue)
     │                         │                              │
     └──── document workspace ─┴── stepper per document ────┘
              Tables → Facts → Terms/Metrics → Done
```

| Area | User intent | Primary API |
| --- | --- | --- |
| Inbox | "What needs my review?" | `GET /jobs`, pipeline statuses |
| Documents | Upload and browse files | `POST /workflow/documents`, `GET /documents` |
| Document workspace | Walk one file through all stages | `GET /documents/{id}/pipeline` |
| Vocabulary | Browse org-wide terms/metrics | `GET /catalog/*` |

## Backend journey (reference)

Full route reference: `manual/backend/ROUTES.md`.

### Stage 0 — Upload & parse

- `POST /workflow/documents` — multipart upload; enqueues parse jobs
- `GET /jobs/{id}` — poll parse progress
- Documents are content-addressed (SHA256 id)

### Stage 1 — Chunk table review

- `GET /chunks/{id}/content` — parsed grid
- `PATCH /chunks/{id}/table` — cell/row/column ops
- `POST /chunks/{id}/commit` — freeze table; auto-starts fact extraction

### Stage 2 — Fact sessions

- Fact agent drafts cards from committed tables
- Human review: approve/reject/edit batch, chat corrections
- `POST /fact-sessions/{sid}/commit` — persist facts; auto-starts NER

### Stage 3 — Staged NER (3 sub-stages + persist)

1. **Candidate** — extract raw term/metric strings
2. **Cluster** — group into canonical meanings
3. **Mapping** — map to live buckets (search/create)
4. **Persist** — deterministic write to `ner` schema + lineage links

Each sub-stage has chat + `POST /ner-sessions/{sid}/review`.

### Stage 4 — Catalogue

- `GET /catalog/buckets`, `/catalog/mentions`, `/catalog/mentions/{id}/trace`

## Capability flags

`GET /health` returns:

```json
{
  "ok": true,
  "capabilities": {
    "database": true,
    "parsing": true,
    "agents": true,
    "ner_schema": true,
    "ner_bucket_service": true
  }
}
```

The UI greys out features when prerequisites are missing:

| Flag | Required for |
| --- | --- |
| `database` | Everything |
| `parsing` | Upload with auto-parse (LlamaCloud key) |
| `agents` | Fact + NER agent sessions (Gemini key) |
| `ner_schema` | NER stages |
| `ner_bucket_service` | Live bucket search/persist (sibling repo) |

## UX principles

1. **Work queue over document tree** — lead with action items, not accordions
2. **Structured review panels** — cards instead of JSON textareas
3. **Progressive disclosure** — 4-step stepper per chunk (Tables → Facts → Terms → Done)
4. **Evidence panel** — collapsible source trace on facts and mentions
5. **Safe redo flows** — confirm destructive uncommit / re-parse actions

## Human-review loop (all agent stages)

1. Agent runs → drafts batch → pauses (`awaiting_review`)
2. UI shows structured review payload
3. User confirms via `POST .../review { confirmed, batch? }` or chats first
4. On confirm, next step starts (or user commits/persist)

Chat is blocked while a review is pending (`409`).

## Polling

Background jobs and agent drafting use in-process asyncio tasks. Poll every
2–3s while:

- Any job has status `queued` or `running`
- Any session has status `created` or `drafting`

Reference: test UI `pollLoop()` in `manual/backend/frontend/index.html`.

## Integration with design sessions

Phase 1: ingestion is **standalone** (documents are global in the backend).

Phase 2 (future): associate documents with `?session=<designId>` in frontend
state; add backend `design_id` association when the main API supports it.

## Implementation slices

### Slice 1 — Foundation ✅

- `ingestion.ts` API client + types
- Routes + `IngestionLayout` shell with capability badges
- `useIngestionHealth`, `useIngestionPoll`, `usePipeline` hooks
- Placeholder pages for inbox, documents, vocabulary

**Done when:** Health loads, routes render, capabilities grey out disabled features.

### Slice 2 — Upload & document list ✅

- Dropzone upload (`POST /workflow/documents`) — always parses into table chunks
- Document list with parse job status polling
- Navigate to document workspace on upload / row click

**Done when:** Upload an `.xlsx` → see it in the list → parse completes → open document workspace.

### Slice 3 — Pipeline + table editor ✅

- Chunk accordion panels with editable grid (`EditableTableGrid`)
- Save table (`PUT /chunks/{id}/content` with `expected_version`)
- Commit chunk / commit all (`POST .../commit`) — auto-starts fact extraction

**Done when:** User can fix cells, save, commit, and see fact session status on the chunk panel.

### Slice 4 — Fact review workspace ✅

- Facts tab on committed chunks with structured fact cards
- Per-card approve/reject, batch confirm, agent chat, commit facts
- Developer controls: design mode, mock mode, capture-once-then-replay

**Done when:** User can review/edit fact cards and commit without JSON editing.

### Developer workflow (token-safe UI iteration)

1. Turn on **Design mode** + **Mock agents** — commit tables, review facts and NER with zero Gemini calls (built-in fixtures).
2. For real data once: turn **Capture next run** on, run one live fact or NER session (capture auto-turns off), then **Use captured fixtures** + **Mock agents**.
3. Optional: `VITE_INGESTION_DESIGN_MODE=true` in env defaults design mode on.

### Slice 5 — NER staged review ✅

- Terms tab with candidate → cluster → mapping stepper
- Structured review cards per stage, agent chat, persist + mention list
- Mock NER fixtures included in developer mock mode

**Done when:** User can walk through all three NER stages and persist without JSON editing.

### Slice 6 — Vocabulary + inbox polish ✅

- Cross-document inbox aggregating table, fact, and NER review gates
- Vocabulary catalogue: bucket + mention browsers with search/filters
- Mention trace drawer (document → chunk → fact → mention → bucket)
- Inbox deep-links to document workspace (`?chunk=&tab=`)

**Done when:** User can see what needs attention from the inbox and trace any catalogued term to its source.

## Shared components (build once, reuse)

| Component | Used in |
| --- | --- |
| `StatusBadge` | Everywhere |
| `useBackgroundJob` | Parse, fact draft, NER draft |
| `ReviewGate` | Facts + NER stages |
| `AgentChatPanel` | Fact + NER sessions |
| `EditableTableGrid` | Chunk review |
| `TracePanel` | Facts, mentions, catalogue ✅ |
| `StageStepper` | Chunk + document level |

## Deferred (not blocking v1)

- Document ↔ design session linking
- SSE streaming (polling is sufficient initially)
- Observation agent stage
- Mobile layout

# Subsystem Optimizer V2 Prototype Runbook

This guide runs the backend and the standalone HTML prototype:

```text
docs/prototypes/subsystem-optimizer-v2.html
```

The prototype talks directly to the V2 backend API. It is not a Vite app and does not need the main frontend dev server.

## What This Prototype Supports

- Load designs and subsystems from the backend.
- Load subsystem optimizer context.
- Start optimization runs.
- Discover opportunities and approaches.
- Select an approach.
- Discover alternatives.
- Manage manifest/fact ingestion.
- Manage metric registry entries.
- Upload CSV/PDF/image observation sources.
- Review extracted candidate rows.
- Edit/accept/reject/group-edit observation rows.
- Commit reviewed observations.
- Inspect facts and committed observations.

## Required Pieces

You need:

1. PostgreSQL/Supabase database reachable from the backend.
2. Backend repo:

   ```text
   C:\Users\alzai\Desktop\repos\agent-exmaple\design_evolution_api_v2
   ```

3. Prototype repo:

   ```text
   C:\Users\alzai\Desktop\repos\procurix-deploy\docs\prototypes
   ```

4. Backend environment variables.

At minimum:

```text
DATABASE_URL=postgresql://...
```

For PDF/image extraction and optimization LLM flows:

```text
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

Some other backend features may also require:

```text
ANTHROPIC_API_KEY=...
SUPABASE_URL=...
SUPABASE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## One-Time Setup

Open PowerShell.

Go to the backend:

```powershell
cd C:\Users\alzai\Desktop\repos\agent-exmaple\design_evolution_api_v2
```

Install backend dependencies if the virtual environment is not already prepared:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Run all migrations:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Confirm Alembic is at the latest revision:

```powershell
.\.venv\Scripts\python.exe -m alembic current
```

Expected current revision after the observation-kind work:

```text
w2x3y4z5a6b7
```

## Start Exactly One Backend

The prototype expects the backend at:

```text
http://localhost:8092/api
```

First stop old duplicate backend processes on ports `8090` and `8092`:

```powershell
$listenerIds = Get-NetTCPConnection -LocalPort 8090,8092 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($listenerId in $listenerIds) {
  if ($listenerId -and $listenerId -ne 0) {
    Stop-Process -Id $listenerId -Force -ErrorAction SilentlyContinue
  }
}
```

Start the backend on `8092`:

```powershell
cd C:\Users\alzai\Desktop\repos\agent-exmaple\design_evolution_api_v2
.\.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 8092
```

Leave this terminal open.

In another PowerShell window, confirm the backend is responding:

```powershell
Invoke-RestMethod http://localhost:8092/api/metrics
```

You should see a JSON response with metric registry items.

## Start The Prototype HTML Server

Open a second PowerShell window:

```powershell
cd C:\Users\alzai\Desktop\repos\procurix-deploy\docs\prototypes
python -m http.server 5500
```

Open this URL in the browser:

```text
http://localhost:5500/subsystem-optimizer-v2.html
```

At the top of the page, set API base to:

```text
http://localhost:8092/api
```

## Basic Smoke Test

1. Click `Load designs`.
2. Select a design.
3. Select a subsystem.
4. Click `Load optimizer context`.
5. Confirm subsystem context appears.
6. Go to `Metrics`.
7. Click `Load metrics`.
8. Confirm metrics such as `unit_price`, `lead_time_days`, `moq`, or `supplier_score` appear.

## Observation Upload Test: CSV

Create a file called `observation_smoke.csv`:

```csv
mpn,supplier,observed_at,unit_price,currency,lead_time_days,moq
TPS54328DDAR,TI,2026-06-01,1.23,USD,42,1000
TJA1051TK,NXP,2026-06-01,0.88,USD,28,500
```

In the prototype:

1. Go to `Observations`.
2. Choose the CSV file.
3. Set `Source type` to `quote_csv`.
4. Click `Upload source`.
5. Click `Approve mapping`.
6. Click `Load candidate rows`.
7. Confirm rows show in the matrix.
8. Edit one row.
9. Save it.
10. Accept or reject a row.
11. Click `Commit batch`.
12. Click `Refresh observations`.

Expected:

- Candidate rows appear before commit.
- Edits revalidate rows.
- Commit inserts observations.
- After commit, the batch becomes locked.

## Observation Upload Test: PDF

Example file:

```text
C:\Users\alzai\Downloads\DRAEXLMAIER Price Indication Letter.pdf
```

In the prototype:

1. Go to `Observations`.
2. Choose the PDF file.
3. Set `Received at` to the document date or the date you received it.
4. Set `Source owner`, for example:

   ```text
   GSM
   ```

5. Set `Source type`, for example:

   ```text
   price_indication_letter
   ```

6. Click `Upload source`.
7. Wait. PDF extraction can take 1-2 minutes.
8. Click `Load candidate rows`.

Expected for this PDF:

- Rows should not all become `metric_not_registered`.
- You should see mixed observation kinds:
  - `commercial_term`
  - `state_fact`
  - `assumption`
  - `constraint`
  - `metric_observation`
- Metric-like rows may still require suggested role/metric review.
- Non-metric rows can be ready without a metric registry entry.

## Reviewing Extracted Rows

The review matrix shows:

- `Group`: extracted table or note block.
- `Kind`: generic kind such as `metric_observation` or `commercial_term`.
- `Subject`: entity the row is about.
- `Role / Metric`: semantic role and optional metric.
- `Value`: numeric/text/JSON value.
- `Date`: observed date and date quality.
- `Dimensions`: qualifiers such as year, scenario, incoterm, location type.
- `Source`: page and excerpt.
- `Status`: ready, needs review, quarantined, rejected.

Use `Edit` to change:

- subject type
- subject
- kind
- role
- metric
- numeric/text value
- unit/currency
- observed date
- dimensions JSON
- source excerpt

Use `Group bulk edit` when a whole group needs the same kind, role, metric, date, or currency.

## Commit Rules

Commit is allowed only when:

- Mapping is approved.
- Suggested metrics used by active metric rows are resolved.

Commit behavior:

- `ready` rows become active observations.
- `needs_review` rows are stored but excluded from aggregation.
- `quarantined` rows are skipped.
- `rejected` rows are skipped.
- The batch is locked after commit.

## Optimizer Flow

After designs/subsystems are loaded:

1. Click `Start run`.
2. Click `Discover opportunities`.
3. Review opportunities.
4. Select an opportunity and approach.
5. Click `Discover alternatives`.

Current optimizer flow uses the backend context and fact/observation infrastructure, but derived observation baselines are still a follow-up stage.

## Troubleshooting

### CORS or Failed To Fetch

Do not open the HTML with `file:///`.

Run it through:

```powershell
python -m http.server 5500
```

Then open:

```text
http://localhost:5500/subsystem-optimizer-v2.html
```

### Backend 404

Check API base:

```text
http://localhost:8092/api
```

Then verify backend:

```powershell
Invoke-RestMethod http://localhost:8092/api/metrics
```

### Duplicate Or Stale Backend

Stop old listeners:

```powershell
$listenerIds = Get-NetTCPConnection -LocalPort 8090,8092 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($listenerId in $listenerIds) {
  if ($listenerId -and $listenerId -ne 0) {
    Stop-Process -Id $listenerId -Force -ErrorAction SilentlyContinue
  }
}
```

Then restart only one backend on `8092`.

### PDF Upload Fails

Check:

- `GEMINI_API_KEY` is set.
- `GEMINI_MODEL` is set or defaults to `gemini-2.5-flash`.
- File is under the inline upload limit.
- File type is PDF/image/CSV/text.

XLSX/DOCX are not converted in this prototype. Export them to PDF or CSV first.

### Alembic / Missing Column Errors

Run:

```powershell
cd C:\Users\alzai\Desktop\repos\agent-exmaple\design_evolution_api_v2
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Then restart the backend.

## Quick Health Checklist

Backend:

```powershell
Invoke-RestMethod http://localhost:8092/api/metrics
```

Prototype:

```text
http://localhost:5500/subsystem-optimizer-v2.html
```

Expected API base:

```text
http://localhost:8092/api
```

Expected latest migration:

```text
w2x3y4z5a6b7
```

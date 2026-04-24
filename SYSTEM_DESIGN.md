# LoanLight — System Design

## 1. Architecture Overview

LoanLight is a document intelligence service that ingests heterogeneous mortgage PDF files, extracts structured borrower records using Claude AI, persists them to a relational database, and surfaces the results over a REST API.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT / OPERATOR                              │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ HTTP
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         NestJS API  (:3000)                              │
│                                                                          │
│  IngestionController   LoansController   BorrowersController             │
│  DocumentsController                                                     │
│                                                                          │
│  IngestionService ──► DocumentClassifierService                         │
│       │                                                                  │
│       ├─► StorageService (MinIO / S3)                                   │
│       └─► BullMQ Queue  ──────────────────────────────────┐             │
│                                                            │             │
│  ExtractionWorker ◄────────────────────────────────────────┘            │
│       │                                                                  │
│       ├─► StorageService (download PDF)                                  │
│       ├─► ExtractionService ──► Anthropic API (Claude Sonnet 4.6)       │
│       └─► Sequelize ORM ──► PostgreSQL                                  │
│                                                                          │
│  Bull Board UI (:3000/admin/queues)                                     │
└─────────────────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
  ┌──────────┐        ┌──────────┐        ┌──────────────┐
  │PostgreSQL│        │  Redis   │        │  MinIO (S3)  │
  │  :5432   │        │  :6379   │        │  :9000/:9001 │
  └──────────┘        └──────────┘        └──────────────┘
```

**Component responsibilities**

| Component | Role |
|---|---|
| NestJS API | HTTP layer, orchestration, query endpoints |
| IngestionService | Scans loan folders, uploads PDFs, enqueues jobs |
| DocumentClassifierService | Regex-based filename → DocType mapping |
| StorageService | S3-compatible upload / download via MinIO |
| BullMQ Queue | Durable async job queue backed by Redis |
| ExtractionWorker | Dequeues jobs, calls Claude, writes to PostgreSQL |
| ExtractionService | Claude API wrapper with retry / JSON parsing |
| PostgreSQL | Relational store for all extracted records |
| Redis | BullMQ persistence, job state, retry metadata |
| MinIO | Object store for raw PDF bytes (S3 API) |

---

## 2. Data Pipeline Design

### 2.1 Ingestion

```
POST /ingestion/run
  │
  ├─ scanLoanFolders()
  │     Reads LOAN_DOCS_PATH directory, matches sub-folders
  │     via /Loan\s+(\w+)/i → loanNumber
  │
  ├─ For each PDF in the folder:
  │     classify(fileName) → DocType   (regex rules, O(1))
  │     storage.upload(s3Key, buffer)  (to MinIO)
  │     documentModel.upsert(...)      (idempotent)
  │     queue.add('extract', {documentId})
  │
  └─ Returns immediately with queued counts
```

`POST /ingestion/run` is idempotent — re-running it upserts existing loans/documents and re-enqueues extraction for every file.

### 2.2 Processing (Extraction Worker)

```
BullMQ Job { documentId }
  │
  ├─ storage.download(doc.s3Key)
  │     Retrieves PDF bytes from MinIO by S3 key
  │
  ├─ extractFromPdf(buffer, docType, fileName)
  │     Converts PDF to base64
  │     Sends as Claude document block with type-specific prompt
  │     Parses JSON response → ExtractionResult
  │     Retries up to 3× on RateLimitError (exponential back-off)
  │
  └─ sequelize.transaction()
        Destroy old income_records / account_records for this document
        Upsert borrowers (findOrCreate by loanId + name)
        Insert income_records with documentId FK
        Insert account_records with documentId FK
        Update document.extractionStatus = COMPLETED
        Create extraction_event (tokens used, model, status)
```

All database writes for a single extraction are wrapped in one transaction — partial extractions never appear in the store.

### 2.3 Storage

| Tier | Technology | What lives here |
|---|---|---|
| Object store | MinIO (S3-compatible) | Raw PDF bytes, keyed as `loans/{loanNumber}/{fileName}` |
| Relational DB | PostgreSQL 16 | Loans, borrowers, documents, income/account records, extraction events |
| Job queue | Redis 7 + BullMQ | Pending/active/failed job state |

### 2.4 Retrieval

All read endpoints are thin Sequelize queries with eager-loaded associations:

```
GET /loans/:id/borrowers
  └─ Loan → [Borrowers → [IncomeRecords (+ Document), AccountRecords (+ Document)]]

GET /borrowers/:id/income
  └─ Borrower → [IncomeRecords → Document (fileName, docType)]
```

Every `income_record` and `account_record` carries a `documentId` FK and a `sourceSnippet` — the verbatim text Claude used — providing a full audit trail to the originating PDF.

---

## 3. AI / LLM Integration Strategy

### 3.1 Model: Claude Sonnet 4.6

| Capability | Why it matters here |
|---|---|
| 200K token context window | An entire loan file (10–20 docs) fits in a single API call; no chunking artifacts |
| Native PDF document blocks | Sends raw PDF bytes as a `document` content block — Claude handles both digital and scanned (OCR) pages internally |
| Instruction-following fidelity | Financial figures require exact extraction; Sonnet 4.6 has low hallucination rates for structured output tasks |
| PII discipline | Will not fabricate SSNs or account numbers not present in the source text |

Alternative models considered:

- **GPT-4o** — comparable context window, no native PDF block (requires separate OCR step), higher per-token cost
- **Gemini 1.5 Pro** — strong PDF support, but less consistent JSON schema adherence in practice
- **Smaller / open-source models** — insufficient instruction-following reliability for financial PII extraction

### 3.2 Prompt Architecture

Two-layer prompt design:

**System prompt** — immutable rules that govern every call:
- Strict enumerated types for `incomeType` and `accountType`
- Explicit prohibition on fabricating values, guessing, or emitting full SSNs
- Single-object JSON schema with `borrowers`, `incomeRecords`, `accountRecords`
- "No markdown, no explanation" — pure JSON response required

**User prompt (per-document)** — assembled by `buildUserPrompt(docType, fileName)`:
- Identifies the document type (W-2, paystub, bank statement, etc.)
- Provides type-specific extraction hints (e.g., "Focus on Box 1 wages, employer EIN, tax year" for W-2)
- Grounds Claude on what to prioritise, reducing irrelevant extractions

### 3.3 Response Parsing

Claude occasionally wraps JSON in a markdown code fence (` ```json `). The `parseJson()` method strips fences before `JSON.parse`. On parse failure it returns empty arrays and logs the raw snippet — the job continues so one bad document does not block the rest of the loan.

### 3.4 Rate Limiting & Retries

`ExtractionService` retries up to three times on `RateLimitError` with exponential back-off (2s → 4s → 8s). BullMQ provides an outer retry layer for any other transient failure.

---

## 4. Handling Document Format Variability

Mortgage files present three distinct variability axes:

### 4.1 File Format

All files are PDFs (the corpus constraint). PDFs are sent directly to Claude as base64 document blocks — no `pdf-parse` or external OCR step. This gives a single code path for:
- **Text-based PDFs** (digitally generated forms, 1040s, closing disclosures)
- **Scanned image PDFs** (paystubs photographed and PDFed, wet-signed LOEs)
- **Mixed PDFs** (scanned pages interleaved with digital pages)

Claude's vision pipeline handles table reconstruction, column alignment, and handwritten annotations that rule-based parsers cannot.

### 4.2 Document Type Classification

`DocumentClassifierService` applies ordered regex rules to the filename before the document is sent to Claude:

```
/closing.?disclosure/i → CLOSING_DISCLOSURE
/\bw[-_]?2\b/i        → W2
/1040|schedule.?c/i   → TAX_RETURN
/paystub|pay.?stub/i  → PAYSTUB
/evoe|employment.?verif/i → EVOE
/checking|savings|bank.?statement/i → BANK_STATEMENT
...                   → UNKNOWN (fallback)
```

The classified `DocType` is stored in the `documents` table and injected into the user prompt as a type-specific hint. This focuses Claude's extraction without constraining it — the model still surfaces anything else it finds.

### 4.3 Schema Variation Within a Type

Even within a type (e.g., W-2), every employer's form looks slightly different. The approach is intentionally schema-free at the input layer:
- No template matching or field coordinate extraction
- No training data per issuer
- Claude reads the document the same way a human processor would

Field-level normalization happens after extraction:
- `normalizeIncomeType(raw)` maps unexpected variants (`paystub_ytd` → `paystub`)
- `normalizeAccountType(raw)` falls back to `other` for unrecognised strings
- Null fields are stored as `null` rather than guessed values

---

## 5. Scaling Considerations

### Current Baseline

- 3 concurrent workers (`EXTRACTION_CONCURRENCY=3`)
- Single Docker Compose node
- Synchronous ingestion scan at startup
- ~20–35 seconds to process 10 documents

### 5.1 Scale to 10× (hundreds of documents/day)

| Bottleneck | Solution |
|---|---|
| Worker concurrency | Raise `EXTRACTION_CONCURRENCY` to 10–15; Claude Sonnet 4.6 supports high request throughput |
| Anthropic rate limits | Upgrade to a higher Anthropic usage tier (token/minute ceiling) |
| PostgreSQL write contention | Current schema with FK indexes handles ~50 concurrent writes without issue |
| MinIO throughput | Containerised MinIO on a volume-backed instance handles hundreds of MB/s |

No code changes required — only environment variable tuning and infrastructure tier upgrades.

### 5.2 Scale to 100× (thousands of documents/day)

At 100×, three things break in the current design:

1. **Ingestion** assumes a shared filesystem and a human triggering `POST /ingestion/run`
2. **Extraction workers** run in one process with no coordination on Anthropic rate limits
3. **The database** has a race condition in borrower upsert that only surfaces under concurrent pods

The design below fixes all three. Follow it in flow order: ingestion → queue → extraction → database.

---

#### Numbers that drive the design

| Metric | Value |
|---|---|
| Target load | ~1,000 docs/day, bursts of 200–400 in one run |
| Avg tokens per document | ~30K input / ~1K output |
| Anthropic rate cap | ~400K tokens/min (standard tier) |
| Concurrent Claude calls at 100× | up to 50 (10 pods × 5 concurrency) |
| Target latency — operator re-extraction | < 60s |
| Target latency — bulk ingestion | < 4 hours |

The bottleneck is not total token volume — it is **concurrent Claude requests during bursts**. Everything below is designed around controlling that concurrency.

---

#### Full architecture

```
Broker / loan officer system
  │ uploads PDF directly
  ▼
S3  (loan-documents)  ──ObjectCreated──►  SQS (loan-ingestion-events)
                                                    │
                              ┌─────────────────────┴──────────────────────┐
                              ▼                                             ▼
                    IngestionService pod A                     IngestionService pod B
                    (classify → upsert DB → enqueue)          (competing consumer)
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
            queue:realtime        queue:batch
            (re-extractions)      (bulk ingestion)
                    │                    │
                    ▼                    ▼
          Realtime Workers        Batch Workers
          (×2–3, fixed)          (×5–10, autoscale)
          concurrency: 5         concurrency: 3
                    │                    │
                    │   Redis token bucket (BullMQ rate limiter)
                    │   max 40 jobs/min across ALL pods
                    │                    │
                    ▼                    ▼
          Anthropic standard      Anthropic Batch API
          endpoint                (50% cost, 24h SLA)
                    │                    │
                    └──────────┬─────────┘
                               ▼
                         PgBouncer :6432
                               │
               ┌───────────────┴──────────────┐
               ▼                              ▼
        PostgreSQL primary             Read replica
        (worker writes)               (API reads)
```

---

#### Step 1 — Ingestion (event-driven, replaces folder scan)

**What breaks today:** `fs.readdirSync(LOAN_DOCS_PATH)` requires all pods to share a local disk. Multiple pods can't do this. Serial uploads in a for-loop timeout on large batches. Someone has to manually call the endpoint.

**The fix:** S3 is the ingestion boundary. External systems upload PDFs directly to S3. Each upload fires an S3 ObjectCreated event to SQS. `IngestionService` consumes from SQS — one message per file, one pod per message.

```
S3 ObjectCreated  →  SQS message: { key: "loans/214/W2_borrower.pdf" }
                              │
                    IngestionService.consume()
                      ├─ parse loanNumber from key path   → "214"
                      ├─ classify(fileName) → DocType     → W2  (regex, no API call)
                      ├─ loanModel.upsert(loanNumber)
                      ├─ documentModel.upsert({ s3Key, docType, status: PENDING })
                      └─ queue.add('extract', { documentId })
                              │
                              └─ ingestion pod never reads PDF bytes
                                 extraction worker downloads from S3 when ready
```

**Deduplication:** SQS FIFO deduplication ID = S3 key. Re-uploading the same file within 5 minutes drops the duplicate at the queue level. `documentModel.upsert` is a second guard at the DB level.

**Backpressure:** if the extraction queue is saturated, the SQS consumer pauses. SQS holds messages until the consumer is ready. The extraction queue never floods.

**`POST /ingestion/run` becomes a backfill endpoint** — no longer the primary path:

```
POST /ingestion/run
  → s3.listObjectsV2(prefix: "loans/")
  → for each object not in documents table (or status = FAILED):
      publish synthetic SQS event  ← same message shape, same consumer code path
```

---

#### Step 2 — Queue (two queues, one Redis Cluster)

Single-node Redis is a SPOF — a restart loses in-flight jobs and stalls everything. At 100× Redis becomes critical infrastructure.

**Redis Cluster** (3 primary + 3 replica nodes) — BullMQ supports Cluster natively via `ioredis`.

Two queues separate urgent from bulk work so a large ingestion run never delays a manual re-extraction:

| Queue | Who writes | Who consumes | Anthropic endpoint |
|---|---|---|---|
| `queue:realtime` | `POST /documents/:id/re-extract` | Realtime workers (×2–3, fixed) | Standard (low latency) |
| `queue:batch` | IngestionService (new files) | Batch workers (×5–10, autoscale) | Batch API (50% cost) |
| `queue:dlq` | BullMQ (exhausted retries) | Manual review / Bull Board | — |

**Job deduplication** — BullMQ `jobId` = `documentId`. Calling `/ingestion/run` twice before the first run finishes won't double-enqueue the same document.

---

#### Step 3 — Extraction (workers + ExtractionService + rate limiting)

**Worker pods are the scaling unit.** Each pod runs `ExtractionWorker` with `ExtractionService` in-process. There is no separate ExtractionService microservice — it's a stateless SDK wrapper with no shared state to centralise. Adding pods is all you need.

```
ExtractionWorker.process({ documentId })
  ├─ documentModel.findByPk(documentId)      ← reads s3Key, docType
  ├─ storage.download(doc.s3Key)             ← fetches PDF bytes from S3
  └─ ExtractionService.extractFromPdf()
       ├─ base64-encode buffer
       ├─ buildUserPrompt(docType, fileName)  ← type-specific hint
       └─ anthropic.messages.create(...)      ← PDF as document block + prompt
```

**Rate limit coordination** — at 10 pods × 5 concurrency = 50 simultaneous Claude calls, pods have no visibility into each other. When the per-minute cap is hit, all pods 429 simultaneously and retry at the same time — thundering herd.

Fix: BullMQ `limiter` backed by Redis enforces a global cap across all pods atomically. Pods pause instead of retrying.

```typescript
@Processor('document-extraction', {
  concurrency: 5,
  limiter: { max: 40, duration: 60_000 }  // 40 jobs/min total, all pods combined
})
```

`ExtractionService` itself is unchanged — per-call retry on `RateLimitError` remains as a safety net. The coordination is in the queue, not in the service.

**Token budget** — the worker checks estimated token count before calling Claude. Documents projected to exceed 150K input tokens are flagged for manual review rather than silently consuming budget.

---

#### Step 4 — Database (race fix, connection pooling, read replica)

**Race condition in borrower upsert** — the current `findOrCreate` is two round-trips with a gap between them. Two pods processing different documents for the same loan can both read "borrower doesn't exist" and both insert, creating duplicates. This is silent at 3 workers; it corrupts data at 30.

**Fix:** add `UNIQUE(loan_id, name)` and use a single atomic upsert:

```sql
INSERT INTO borrowers (loan_id, name, address, ssn_last4)
VALUES ($1, $2, $3, $4)
ON CONFLICT (loan_id, name) DO UPDATE
  SET address   = COALESCE(EXCLUDED.address,   borrowers.address),
      ssn_last4 = COALESCE(EXCLUDED.ssn_last4, borrowers.ssn_last4)
RETURNING *;
```

One round-trip, no race window. Sequelize supports this via `Model.upsert()` with `conflictFields`.

**PgBouncer** — 30+ pods each holding a Sequelize connection pool hits PostgreSQL's `max_connections` (default 100) before write throughput becomes an issue. PgBouncer in transaction mode multiplexes hundreds of application connections down to ~20–30 server connections.

**Read replica** — all `GET` endpoints route to the replica via Sequelize replication config. The primary handles only worker writes.

**Partitioning** — `income_records` and `account_records` grow linearly. Partition by `loan_id` hash (8–16 partitions) so each partition's index fits in `shared_buffers`.

---

#### Storage, caching, observability

**S3** — swap MinIO for AWS S3 via env vars, zero code changes. Enable S3 Intelligent-Tiering (PDFs are accessed once during extraction then rarely). Move documents older than 90 days to Glacier Instant Retrieval via lifecycle rule.

**Caching** — cache `GET /loans/:id/borrowers` in Redis (30s TTL). Invalidate when extraction worker publishes a `loan.completed` event to Redis Pub/Sub. Do not cache monitoring endpoints (`/documents`, extraction events) — they must show real-time state.

**Observability** — alert before incidents, not after:

| Signal | Alert condition |
|---|---|
| Batch queue depth | > 500 jobs for > 30 min |
| DLQ depth | Any job in DLQ |
| Token cost per doc (p99) | > 80K input tokens |
| Extraction failure rate | > 5% over 15 min |
| Claude API latency (p95) | > 30s |

The `extraction_events` table is the primary data source for all of these — it records model, tokens, status, and error per attempt.

---

## 6. Key Technical Trade-offs

### Single PDF → single Claude call vs. chunking

**Chosen:** One call per document, full PDF as a document block.

**Trade-off:** Large PDFs (100+ pages) consume significant tokens. The benefit is that Claude sees the full document context — cross-page references (e.g., a name on page 1 matching an account on page 8) are resolved correctly. Chunking would require a reconciliation pass and risks missing cross-chunk entities.

**Mitigation:** The `extraction_events` table records `inputTokens` per call; outlier docs can be flagged and reviewed manually.

---

### Regex classification vs. content-based classification

**Chosen:** Regex on filename.

**Trade-off:** Brittle for unusually named files; produces `UNKNOWN` for anything that doesn't match. The upside is zero latency, zero extra API calls, and 100% determinism in tests.

The DocType hint improves extraction quality but is not strictly required — the system prompt instructs Claude to extract everything present regardless of type. An `UNKNOWN` classification degrades hint quality, not extraction correctness.

**Future option:** Run a lightweight Claude call on the first page to classify ambiguous documents.

---

### BullMQ (async) vs. synchronous extraction

**Chosen:** Async queue.

**Trade-off:** Results are not immediately available after `POST /ingestion/run`. The tradeoff is that the API never blocks on Claude latency, jobs survive restarts, and concurrency is tunable without changing API code.

---

### Sequelize ORM vs. raw SQL

**Chosen:** Sequelize with TypeScript models.

**Trade-off:** Slightly more verbose than Prisma; less type-safe than Drizzle. The benefit is first-class NestJS integration (`@nestjs/sequelize`), migration support, and readable model definitions that match the schema exactly.

---

### MinIO vs. local filesystem

**Chosen:** MinIO (S3-compatible object store).

**Trade-off:** Adds an extra service to `docker-compose`. The benefit is environment parity: workers download PDFs by `s3Key` regardless of which pod they run on. Switching to AWS S3 in production requires only env var changes.

---

## 7. Error Handling & Data Quality Validation

### 7.1 Per-Job Error Handling

```
ExtractionWorker.process()
  ├─ RateLimitError        → exponential retry (up to 3 attempts, 2s/4s/8s)
  ├─ JSON parse failure    → empty arrays returned; job continues; error logged
  ├─ Any other error       → document.extractionStatus = FAILED
  │                          extraction_event created with errorMessage
  │                          BullMQ marks job failed (retried per queue config)
  └─ All writes transactional → no partial rows committed on failure
```

### 7.2 Loan-Level Status Aggregation

After each document finishes, `updateLoanStatus()` checks all documents in the loan:
- All `COMPLETED` → loan status = `COMPLETED`
- Any `FAILED` → loan status = `FAILED`
- Otherwise → loan remains `PROCESSING`

Operators can query `GET /loans` to find loans with `status=failed` and inspect per-document events.

### 7.3 Re-extraction

`POST /documents/:id/re-extract` re-enqueues any document. The worker clears prior `income_records` and `account_records` for that document before writing new ones, preventing duplicate data.

### 7.4 Data Quality Constraints

**At the Claude prompt layer:**
- Enumerated types enforced by system prompt — Claude must use only allowed `incomeType` / `accountType` values
- No fabrication rule — Claude is explicitly prohibited from guessing or filling gaps
- SSN restriction — only last 4 digits may be extracted; full SSNs are rejected by prompt instruction

**At the application layer:**
- `normalizeIncomeType` / `normalizeAccountType` coerce out-of-range values to `other` rather than failing
- Empty `borrowerName` is skipped (`if (!borrowerName?.trim()) return null`)
- Amounts stored as `DECIMAL(12,2)` — truncates, never silently truncates strings

**At the database layer:**
- `NOT NULL` on required fields (`borrower.name`, `income_record.amount`, etc.)
- FK constraints with `ON DELETE CASCADE` prevent orphaned records
- UUID primary keys — no integer overflow, globally unique across future shards

### 7.5 Audit Trail

Every extraction attempt — success or failure — produces an `extraction_event` row with:
- `status` (success / failed)
- `modelUsed` (exact model ID, e.g. `claude-sonnet-4-6-20251001`)
- `inputTokens` / `outputTokens`
- `errorMessage` (on failure)

Every `income_record` and `account_record` includes:
- `documentId` → exact PDF the value came from
- `sourceSnippet` → verbatim text Claude cited

This enables an underwriter to trace any extracted figure back to the originating document and the exact text that produced it.

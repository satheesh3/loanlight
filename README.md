# LoanLight

Unstructured document extraction system for mortgage loan files. Extracts structured borrower PII, income history, and account records from heterogeneous PDFs using Claude AI, served via a REST API.

## Architecture at a Glance

```
POST /ingestion/run
  → upload PDFs to MinIO (S3)
  → enqueue BullMQ jobs (Redis)
      → workers call Claude API (base64 PDF → structured JSON)
      → persist to PostgreSQL
GET /loans/:id/borrowers  → borrowers + income history + source document refs
```

**Stack:** NestJS · Sequelize · PostgreSQL · BullMQ · Redis · MinIO · Claude Sonnet 4.6

---

## Setup & Run

### Prerequisites

- Docker + Docker Compose
- Anthropic API key

### 1. Configure environment

```bash
cp .env.example .env
# set ANTHROPIC_API_KEY in .env
```

### 2. Start everything

```bash
docker compose up
```

This builds the API image and starts PostgreSQL, Redis, MinIO, and the API in one command.

- API: `http://localhost:3000`
- Queue dashboard: `http://localhost:3000/admin/queues`
- MinIO console: `http://localhost:9001` (minioadmin / minioadmin)

### 3. Run ingestion

```bash
# Ingest all loan folders
curl -X POST http://localhost:3000/ingestion/run

# Ingest a specific loan
curl -X POST http://localhost:3000/ingestion/loans/214
```

The API returns immediately — extraction runs asynchronously. Watch progress at `/admin/queues`.

### 4. Query results

```bash
# List all loans
curl http://localhost:3000/loans

# Get loan detail (export LOAN_ID from above)
curl http://localhost:3000/loans/$LOAN_ID

# Get all borrowers with income history and account records
curl http://localhost:3000/loans/$LOAN_ID/borrowers

# Get a specific borrower's income history with source doc refs
curl http://localhost:3000/borrowers/$BORROWER_ID/income

# List all documents and their extraction status
curl http://localhost:3000/documents

# Re-run extraction on a specific document
curl -X POST http://localhost:3000/documents/$DOC_ID/re-extract
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/ingestion/run` | Ingest all loan folders |
| `POST` | `/ingestion/loans/:loanNumber` | Ingest a specific loan |
| `GET` | `/loans` | List loans with status |
| `GET` | `/loans/:id` | Loan detail with borrowers and documents |
| `GET` | `/loans/:id/borrowers` | Borrowers with income + account records |
| `GET` | `/borrowers/:id` | Full borrower profile |
| `GET` | `/borrowers/:id/income` | Income history with source document references |
| `GET` | `/documents` | List documents (filter: `?loanId=...`) |
| `GET` | `/documents/:id` | Document detail + extraction events |
| `POST` | `/documents/:id/re-extract` | Re-run Claude extraction |

---

## Running Tests

```bash
npm test
```

Covers:
- **DocumentClassifierService** — all 10 document types from the corpus classified correctly
- **ExtractionService** — JSON parsing, malformed response handling, markdown fence stripping, 429 retry logic

---

## Architectural Decisions

### Why Claude Sonnet 4.6?
- **200K token context** — entire loan file fits in one call; no chunking artifacts
- **Native PDF input** — base64 document block handles both digital and scanned PDFs without separate OCR
- **Structured output fidelity** — critical for financial figures; lower hallucination rate than alternatives
- **PII discipline** — will not emit SSNs not present in source text

### Why MinIO (not local filesystem)?
Local development uses MinIO (S3-compatible, Docker). Workers download PDFs by `s3Key` — decoupled from any local path. Switching to AWS S3 in production requires only env var changes; zero code changes.

### Why BullMQ (async queue)?
`POST /ingestion/run` returns in ~1–2s regardless of how many documents are enqueued. Workers process concurrently (configurable via `EXTRACTION_CONCURRENCY`). Jobs survive app restarts. The Bull Board UI at `/admin/queues` gives real-time visibility into job states.

### Source attribution
Every `income_record` and `account_record` has a `documentId` FK pointing to the exact PDF it was extracted from, plus a `sourceSnippet` (verbatim text from Claude's extraction). This provides full audit trail for any extracted value.

### No pdf-parse
All PDFs go directly to Claude as base64 document blocks. This gives identical code paths for text-based and scanned PDFs, preserves table structure better than raw text extraction, and eliminates a dependency.

---

## Scaling

See [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) for full architecture, scaling strategy (10x/100x), trade-offs, and error handling design.

**Quick summary:**
- **Today**: 3 concurrent workers, ~20–35s for 10 docs, non-blocking API
- **10x**: raise `EXTRACTION_CONCURRENCY`, upgrade Anthropic tier
- **100x**: horizontal worker pods, read replica, Anthropic Batch API, Redis cache

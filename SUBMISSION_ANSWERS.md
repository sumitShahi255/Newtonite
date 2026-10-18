# Newtonite Software Engineering Challenge — Submission Answers & Interview Preparation

This document contains **ready-to-submit answers** for all 14 questions of the official Google Form, as well as **deep architectural answers** for the live technical evaluation interview with Newtonite engineers.

---

## Part 1: Official Google Form Answers

### Question 1: Full name
> **[Your Full Name]** *(e.g., Sumit Sahi)*

### Question 2: Enrolment / roll number
> **[Your Roll Number / Enrolment ID]**

### Question 3: School and programme
> **SCSE — B.Tech CSE** *(or your specific Galgotias programme)*

### Question 4: Year / batch
> **2023–2027** *(or your graduating batch)*

### Question 5: University email ID
> **[Your university email address]**

### Question 6: Mobile number
> **[Your 10-digit mobile number]**

### Question 7: GitHub repository link
> `https://github.com/[your-username]/newtonite-ops-[your-rollno]`

### Question 8: Live deployment link (Optional)
> `http://localhost:5173` *(or your Render / Railway / Vercel deployment link)*

### Question 9: Demo video link (Optional)
> `[Insert 3–5 minute unlisted YouTube / Google Drive link]`

### Question 10: Tech stack used (frontend, backend, database)
> **Frontend:** React 18, TypeScript, Vite, Vanilla CSS Design System (Dark Glassmorphism, Plus Jakarta Sans), Lucide Icons  
> **Backend:** Node.js, Express, TypeScript, Zod, JWT Auth, Supertest  
> **Database & ORM:** PostgreSQL / SQLite, Prisma ORM, Transactions (`prisma.$transaction`)  
> **Background Processing & Testing:** Transactional Outbox Pattern Background Worker, Vitest (9 critical concurrency & workflow automated tests)  
> **Deployment:** Docker & Docker Compose (`postgres:16-alpine`, `backend`, `frontend`)

### Question 11: Which critical behaviours did you implement?
- [x] **Concurrent claim** (Atomic conditional update `WHERE id=? AND assigneeId IS NULL;` returns 409 Conflict to loser)
- [x] **Stale-update handling** (Optimistic concurrency locking via monotonic `version` field; mismatch returns 409 with latest resource)
- [x] **Idempotency** (`Idempotency-Key` header with sha256 request hashing, in-flight locks, and atomic response caching)
- [x] **Workflow rules** (Server-enforced transition map: `OPEN → IN_PROGRESS → AWAITING_APPROVAL → RESOLVED → CLOSED`; approval strictly restricted to `LEAD` or `ADMIN`)
- [x] **Resource-level authorization** (Server-enforced RBAC per team: `VIEWER`, `MEMBER`, `LEAD`, `ADMIN`; cross-team access blocked with 403 Forbidden)
- [x] **Reliable async jobs** (Transactional Outbox table written in same DB transaction; worker processes with exponential backoff, retry caps at 5, and idempotent execution)
- [x] **Optimistic UI reconciliation** (Instant UI updates with graceful rollback and Concurrency Conflict Modal diff dialog on 409/403)

### Question 12: Most important engineering decision you made, in 100 words
> We unified all operational state mutations, append-only activity history, and asynchronous notification jobs inside a single database transaction envelope (`prisma.$transaction`). By rejecting application-level dual-writes and third-party message queues, we guarantee that history can never disagree with item state and notifications can never be orphaned or dispatched for aborted transactions. Pair this with atomic conditional updates for concurrent claims (`assigneeId IS NULL`) and monotonic version checks for optimistic locking, the system achieves rock-solid correctness under heavy operator concurrency without expensive distributed locks or database deadlocks.

### Question 13: GitHub profile / portfolio link
> `https://github.com/[your-username]`

### Question 14: Confirmation checkbox
- [x] **I confirm this is my individual work, I can explain all of it, and the repo runs using the README.**

---

## Part 2: Technical Defense & Live Interview Preparation

Newtonite interviewers will probe deeply on engineering judgement and trade-offs. Use these structured answers:

### 1. How does the architecture work? (Draw/explain in 60 seconds)
> **Flow:** `Browser (React SPA)` ➔ `REST API (Express + TypeScript)` ➔ `PostgreSQL (via Prisma ORM)` ➔ `Outbox Worker (Async Poller)`
> 
> 1. The client performs actions (e.g. Claim, Transition, Update) sending a JWT and optional `Idempotency-Key`.
> 2. The API middleware authenticates the user and verifies that their role in that specific item's team permits the action.
> 3. Inside a single database transaction, the API updates the `work_items` row (verifying version), appends an event to `activity_events`, and writes a job to `outbox_jobs`.
> 4. An independent background worker continuously polls `outbox_jobs` for pending items, dispatches external side-effects idempotently, and updates status to `COMPLETED` (or retries with exponential backoff).

---

### 2. What happens when things fail?
- **Database goes down mid-request:** The HTTP request fails with 500; the atomic transaction rolls back completely. The frontend catches the error, rolls back its optimistic update, and displays an alert. No partial state is ever written.
- **Worker crashes mid-job:** The job remains in status `PROCESSING` or `PENDING`. When the worker restarts, it picks up the job again. Because the worker's execution handler uses deterministic deduplication keys (`jobType:workItemId:action`), it executes idempotently without duplicate notifications.
- **Network retry / user double-clicks:** The client sends an `Idempotency-Key`. If the request is currently in-flight, the server returns 409. If it already finished, the server replays the cached 201/200 response directly from `idempotency_keys` without re-creating the record.
- **Two users collide claiming an item:** Both issue `POST /items/:id/claim`. The atomic SQL conditional update (`WHERE id = ? AND assigneeId IS NULL`) ensures only one user updates 1 row; the second thread updates 0 rows and immediately receives `409 Conflict`. The loser's frontend displays who claimed it.

---

### 3. What assumptions did you make, and which would you check with a Product Manager first?
- **Assumption 1 (Claim Auto-Transition):** We assumed that claiming an unassigned `OPEN` work item automatically transitions its status to `IN_PROGRESS`. *Check with PM:* Should operators be allowed to claim items and keep them in `OPEN` as a backlog reservation?
- **Assumption 2 (Approval Authority):** We assumed only `LEAD` and `ADMIN` can pass `AWAITING_APPROVAL → RESOLVED`. *Check with PM:* Can a Lead delegate approval authority to a designated Senior Member during on-call shifts?
- **Assumption 3 (Cross-Team Visibility):** We assumed users cannot view work items outside their assigned teams unless they have the global `ADMIN` role. *Check with PM:* Should members have read-only cross-team visibility for company-wide incident awareness?

---

### 4. Which part of the system matters most, and why?
> **The atomic transaction envelope encompassing state mutation, activity history, and outbox scheduling.**
> In high-pressure operational tooling, feature count does not matter if the state is unreliable. If an item claims to be resolved, but the history says it's in progress, or a Lead never got the outbox notification, operations grind to a halt. Correctness under concurrency is the foundational pillar of the entire platform.

---

### 5. What would change at 10× scale (100k+ work items, 500+ concurrent operators)?
1. **Database Partitioning:** Range-partition `activity_events` and `outbox_jobs` by month/team so hot tables remain compact and index scans remain in RAM.
2. **Read Replicas & Connection Pooling:** Implement PgBouncer connection pooling and route list/dashboard queries to read replicas while keeping transactional mutations on the primary write node.
3. **Outbox Worker Scalability:** Transition worker pickup from basic polling to PostgreSQL `FOR UPDATE SKIP LOCKED` across multiple distributed worker containers, or push from outbox table to a dedicated Redis BullMQ cluster.
4. **Search Engine:** Replace SQL substring matching with PostgreSQL `tsvector` full-text search with GiST/GIN indexes or OpenSearch.

---

### 6. Live Coding Modification Cheatsheet (Quick adjustments you can do live):
- **To add a new status (e.g. `BLOCKED`):**
  Open `backend/src/workflow/stateMachine.ts`, add `'BLOCKED'` to `WorkItemStatus`, and add transition rules:
  ```ts
  { from: 'IN_PROGRESS', to: 'BLOCKED', allowedRoles: ['MEMBER', 'LEAD', 'ADMIN'], description: 'Block item' },
  { from: 'BLOCKED', to: 'IN_PROGRESS', allowedRoles: ['MEMBER', 'LEAD', 'ADMIN'], description: 'Unblock item' }
  ```
- **To allow Leads to reassign items:**
  Check `backend/src/services/workItem.service.ts` line 348 — it is already implemented: `if (updates.assigneeId !== undefined && role !== 'LEAD' && role !== 'ADMIN') throw new ForbiddenError(...)`.

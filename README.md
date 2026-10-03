# Provera

**Audit-ready media verification artifacts powered by Cloudinary.**

Provera turns uploaded field media into a transparent verification record by combining Cloudinary media ingestion, supported AI/media analysis, OCR/visual signals, application-level deterministic consistency checks, structured metadata, signed transformations, optimized delivery, and QR verification.

## Hackathon

- **Event:** Pixels to Products — Cloudinary AI Hackathon 2026
- **Track:** Track 1 — AI Media Pipelines
- **Team:** Vermithor
- **Repository:** Public GitHub repository
- **Build window:** Sep 15 – Oct 4, 2026
- **Code freeze:** Oct 4, 2026 · 00:15 IST

## Important product boundary

Provera does **not** claim to prove historical authenticity, calculate a scientifically validated fraud probability, make a legally binding fraud determination, or make the original image immutable merely because a hash exists.

It produces a transparent **Forensic Consistency Score** and a signed verification record tied to a specific asset/state.

## Core workflow

1. Upload field media through Cloudinary.
2. Obtain one reliable Cloudinary-supported analysis/OCR/visual workflow.
3. Normalize the observable signals.
4. Run deterministic application-level consistency rules.
5. Produce a score and visible reasons.
6. Attach verification metadata to the Cloudinary asset.
7. Generate a signed dynamic verification artifact.
8. Add a QR code to the verification view.
9. Let judges inspect the Cloudinary asset, metadata, transformation and delivery details.

## Repository documentation

- [Product Requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Cloudinary Integration](docs/CLOUDINARY.md)
- [Analysis Capabilities (verified)](docs/ANALYSIS_CAPABILITIES.md)
- [Forensic Engine](docs/FORENSIC_ENGINE.md)
- [Verification Model](docs/VERIFICATION_MODEL.md)
- [API Contract](docs/API_CONTRACT.md)
- [UI Specification](docs/UI_SPEC.md)
- [Build Plan](docs/BUILD_PLAN.md)
- [Cline Workflow](docs/CLINE_WORKFLOW.md)

## Local setup

Requires Node.js 20.9 or newer (developed on 24) and a Cloudinary account.

```bash
npm install
cp .env.example .env.local   # then fill in the three credentials below
npm run dev                  # http://localhost:3000
```

Fill in `.env.local`:

| Variable | Where to get it |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Cloudinary console → account name |
| `CLOUDINARY_API_KEY` | Cloudinary console → API keys |
| `CLOUDINARY_API_SECRET` | Cloudinary console → API keys |
| `NEXT_PUBLIC_APP_URL` | Public base URL; defaults to `http://localhost:3000` |

The three credentials are read **server-side only** and never leave the server;
`NEXT_PUBLIC_APP_URL` is the only public one, and it decides where QR codes and
verification links point.

**Account prerequisite.** Verification writes seven structured metadata fields to
each asset — `provera_status`, `provera_score`, `provera_record_id`,
`provera_record_hash`, `provera_timestamp`, `provera_version` and `provera_flags`.
Create them once in the Cloudinary console (Settings → Structured metadata); an
upload and analysis still work without them, but `POST /api/verify` fails
deliberately rather than recording a verification it cannot mirror.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Unit tests (`node --test`, no runner dependency) |

### Stack

Only what the project actually uses:

- **Next.js 16** (App Router, Route Handlers, Server Components) + React 19 + TypeScript
- **Tailwind CSS 4**
- **`cloudinary`** — Server SDK for upload, analysis, metadata, QR asset, search and URL signing
- **`qrcode-generator`** — deterministic QR encoding (PNG written in-repo, no image library)
- Node.js **`crypto`** — record hashing and ID generation
- **`jsqr`** (dev-only) — decodes the generated QR in tests so correctness is verified, not assumed

## Where things are

| Route | Purpose |
|---|---|
| `/` | Upload → analyse → score → verify |
| `/verify/{recordId}` | Public verification page (QR destination, no login) |
| `/inspector?recordId=…` | Live Cloudinary state beside the record |
| `/audit` | Search the verifications held in Cloudinary |

| API | Purpose |
|---|---|
| `POST /api/upload` | Store an image (201) |
| `POST /api/analyze` | Run the Cloudinary analysis workflow |
| `POST /api/score` | Score a normalized analysis |
| `POST /api/verify` | Create and persist a verification record (201) |
| `GET /api/verify/{id}` | Stored record + recomputed integrity hash |
| `GET /api/artifact/{id}` | Signed artifact, QR and delivery check |
| `GET /api/inspector/{id}` | Inspector Mode report as JSON |
| `GET /api/assets` | Audit queue as JSON |

Full request and response shapes: [API Contract](docs/API_CONTRACT.md).

## Verification records 

`POST /api/verify` re-analyses an uploaded asset on the server, scores it with the
deterministic forensic engine, builds a canonical verification record and persists
it. A record carries the score, status, signal breakdown, reasons, flags,
engine/schema versions, timestamp, record ID and a SHA-256 integrity hash of the
canonical record.

- Records are stored as one JSON file per record under `data/records/` (git-ignored). They survive server restarts but not container/host rebuilds; the store is single-instance and not tamper-proof. No database and no additional environment variables are required.
- `GET /api/verify/:recordId` returns the stored record and recomputes its hash.
- The summary is attached to the Cloudinary asset as structured metadata (`provera_status`, `provera_score`, `provera_record_id`, `provera_record_hash`, `provera_timestamp`, `provera_version`, `provera_flags`). If the metadata update fails, the record is rolled back and the API reports `METADATA_UPDATE_FAILED`.

Exact hash procedure, persistence limitations and endpoint details: [Verification Model](docs/VERIFICATION_MODEL.md) and [API Contract](docs/API_CONTRACT.md).

## Signed verification artifact 

`GET /api/artifact/:recordId` renders the stored record as a Cloudinary dynamic transformation of the verified asset — a fixed 1200×1200 dark canvas with the photo letterboxed inside it, text layers carrying status, Forensic Consistency Score, record ID, short record hash, engine version, timestamp and the verification destination, and `f_auto`/`q_auto` for optimized delivery. Nothing is stored by the application: Cloudinary generates and caches the derived image on first request, and the API verifies with a `HEAD` request that an image really came back before reporting success.

- The delivery URL is signed server-side (`sign_url: true`); `CLOUDINARY_API_SECRET` never leaves the server, and the artifact URL and every transformation component are returned for inspection.
- Cloudinary enforces delivery signatures only for restricted assets. These assets use the default public delivery, so the signature authenticates the *requested transformation* — any edit to it invalidates the signature — but it is not access control. Measured evidence is in [Cloudinary Integration](docs/CLOUDINARY.md).
- An artifact is tamper-evident evidence of what was recorded and assessed at that moment. It is not proof that the photograph is authentic, and it is not immutable.

## QR code and public verification page

Every artifact carries a QR code, printed bottom-left, that resolves to `{NEXT_PUBLIC_APP_URL}/verify/{recordId}` — a public page anyone can open with no login and no API key.

- The QR is generated in application code (`src/lib/qr/qr.ts`) as a deterministic grayscale PNG with no image dependency, then uploaded to Cloudinary as `provera/qr-<recordId>` so the CDN can composite it. Re-running a request replaces the same asset, keeping the artifact URL and its signature stable.
- Correctness is tested, not assumed: `src/lib/qr/qr.test.ts` decodes the generated PNG with an independent decoder (jsQR) and asserts it resolves to the exact destination URL.
- The code encodes a URL and nothing else — no score, verdict or hash — so the page is the only source of those values.
- The page shows the recorded assessment in full (status, score, signal breakdown with the underlying measurements, coverage, reasons, flags, timestamp, engine version) and recomputes the record hash so a reader can see whether the record still matches itself. It never states that the photograph is authentic.
- Malformed IDs and unknown-but-valid IDs get their own honest states; a missing record is never reported as a passed or failed verification.
- The QR only resolves for the configured application URL: if the deployment moves, previously printed artifacts point at the old host.

## Inspector Mode 

`/inspector` reads the live Cloudinary account during the request and puts it next to the record, so the integration can be checked without trusting Provera's own summary. Pick a record from the list or paste an ID; the same report is available as JSON at `GET /api/inspector/:recordId`.

- **Asset identity** — the public ID, resource type, format, version and delivery URL the record was created against, against what Cloudinary returns now. A different `version` means the file at that public ID was replaced after verification, and the report says exactly that. Fields the record never stored are marked "not compared", never counted as agreement.
- **Live asset** — `asset_id`, dimensions, bytes, timestamps, perceptual hash, EXIF, image metadata keys, tags, context, predominant colours and the Admin API rate-limit counters.
- **Structured metadata** — all seven `provera_*` fields, each labelled match / mismatch / missing. Mismatches are reported, never repaired.
- **Recorded signals** — the normalized signal values from the record, with a `null` shown as *unavailable* rather than zero.
- **Artifact** — the rendered image, the signed URL and signature, all ten transformation components with their parameters, and the `f_auto` / `q_auto` pair with the measured delivery response.
- **Derivatives Cloudinary generated** — cached derived images carrying this record's ID, with Cloudinary's own `transformation_signature`: the account's evidence that the transformation really ran.

The comparison was verified against the live account by writing `99` into `provera_score` on a verified asset: the report immediately showed that field as a mismatch, and returned to a clean 7/7 once the original value was written back. A section that cannot be produced (unreadable asset, failed QR upload, failed artifact delivery) is reported as unavailable with its reason and the rest of the report still renders — nothing is fabricated to fill a gap. Measured Admin API fields and the stated limits are in [Cloudinary Integration](docs/CLOUDINARY.md).

## Audit queue 

`/audit` is the searchable list of verifications. **There is no queue database** — every row is a Cloudinary asset whose `provera_*` structured metadata is read back during the request, so the metadata written in Phase 4 doubles as the index. Delete the asset in Cloudinary and the row disappears; the page says a row exists only while the asset does.

- Filter by **status** (`VERIFIED` / `REVIEW` / `FLAGGED`), by **score** (an inclusive min/max range), and **sort** by upload time or score. Paginate through Cloudinary's cursor.
- The same data is available at `GET /api/assets`.
- Assets with no `provera_record_id` (uploads and QR images) are not queue rows; the count of skipped assets is reported rather than dropped silently.

Two things the queue deliberately does not do, because doing them quietly would be dishonest: a record with no recorded score cannot satisfy a score filter (it is not treated as `0`), and because the metadata filters run after retrieval, an empty page can still have matches on a later page — so the page offers a next page rather than claiming there is nothing. Unusable filter values are returned with a reason and the request still succeeds, so a typo is visible rather than silently ignored.

Cloudinary's Search API **cannot** filter on these structured metadata fields on this account — every `metadata_*` expression is rejected with *"Field … not supported"* — so retrieval, ordering and paging are Cloudinary-side while the status and score filters run in Provera over the metadata Cloudinary returns. The response says which side did what, and the page states it. Full measured evidence, including three rejected syntax variants, is in [Cloudinary Integration](docs/CLOUDINARY.md).

## Hardening 

Every case the build plan names was exercised against the live account — clean, suspicious, inconsistent, invalid input, missing analysis, invalid record — plus a secret scan and a presentation pass. **65 hardening checks, 43 presentation checks and 133 unit tests pass.**

The engine demonstrably discriminates: a detailed 1600×1200 scene scored **84 VERIFIED**, while a 24×18 flat single-colour image scored **61 REVIEW** and raised a `concern:mediaQuality` flag that the clean image did not.

Tampering with a stored record is detected everywhere it should be — the API reports `integrity.verified = false`, the public page shows the warning, and Inspector Mode flags it — and restoring the file restores the check. Nothing silently re-hashes a tampered record.

Four real problems were found and fixed:

- `POST /api/upload` returned `200` for a creation while `POST /api/verify` returned `201`; both now return `201`.
- `POST /api/upload` was missing from the API contract entirely; it is now documented.
- `/audit` had no labelled regions; its filter form and results are now `<section aria-label>` elements.
- A 64-character record hash sat in a table cell without `break-all`, forcing a table wider than a phone viewport.

**Secret scan: nothing found.** The API secret and key were searched for across 73 tracked files, generic secret shapes, **all 132 blobs in the git history**, and all seven live HTML/JSON responses. `.env.local` is git-ignored and `.env.example` has every credential empty.

`next/image` was exercised for real — the optimizer serves Cloudinary sources and refuses other hosts. Layout itself was checked by inspecting rendered markup, **not** by rendering at real viewport widths; that limitation is stated in [Verification Model](docs/VERIFICATION_MODEL.md).

## Repository status

Phases 1–9 of [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) are implemented and committed, one commit per phase. The build order and the phase-by-phase workflow live in [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) and [docs/CLINE_WORKFLOW.md](docs/CLINE_WORKFLOW.md).

Everything claimed above was verified against a real Cloudinary account rather than asserted. Where a capability was unavailable or a provider behaviour differed from the documented expectation, that is recorded in the docs instead of being worked around silently — see [Analysis Capabilities](docs/ANALYSIS_CAPABILITIES.md) and [Cloudinary Integration](docs/CLOUDINARY.md).

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

The repository is intentionally documentation-first. Initialize the Next.js application in this repository after the baseline documentation commit.

Recommended stack from the final specification:

- Next.js 14+
- TypeScript
- Tailwind CSS
- Lucide Icons
- Cloudinary Upload Widget / Upload API
- `next-cloudinary`
- `@cloudinary/url-gen`
- Next.js Server Actions / API Routes
- Node.js `crypto` for application-level record hashing
- `qrcode-generator` for QR encoding, and `jsqr` (dev-only) to decode the result in tests

Create `.env.local` from `.env.example` and never commit secrets.

## Verification records (Phase 4 — implemented)

`POST /api/verify` re-analyses an uploaded asset on the server, scores it with the
deterministic forensic engine, builds a canonical verification record and persists
it. A record carries the score, status, signal breakdown, reasons, flags,
engine/schema versions, timestamp, record ID and a SHA-256 integrity hash of the
canonical record.

- Records are stored as one JSON file per record under `data/records/` (git-ignored). They survive server restarts but not container/host rebuilds; the store is single-instance and not tamper-proof. No database and no additional environment variables are required.
- `GET /api/verify/:recordId` returns the stored record and recomputes its hash.
- The summary is attached to the Cloudinary asset as structured metadata (`provera_status`, `provera_score`, `provera_record_id`, `provera_record_hash`, `provera_timestamp`, `provera_version`, `provera_flags`). If the metadata update fails, the record is rolled back and the API reports `METADATA_UPDATE_FAILED`.

Exact hash procedure, persistence limitations and endpoint details: [Verification Model](docs/VERIFICATION_MODEL.md) and [API Contract](docs/API_CONTRACT.md).

## Signed verification artifact (Phase 5 — implemented)

`GET /api/artifact/:recordId` renders the stored record as a Cloudinary dynamic transformation of the verified asset — a fixed 1200×1200 dark canvas with the photo letterboxed inside it, text layers carrying status, Forensic Consistency Score, record ID, short record hash, engine version, timestamp and the verification destination, and `f_auto`/`q_auto` for optimized delivery. Nothing is stored by the application: Cloudinary generates and caches the derived image on first request, and the API verifies with a `HEAD` request that an image really came back before reporting success.

- The delivery URL is signed server-side (`sign_url: true`); `CLOUDINARY_API_SECRET` never leaves the server, and the artifact URL and every transformation component are returned for inspection.
- Cloudinary enforces delivery signatures only for restricted assets. These assets use the default public delivery, so the signature authenticates the *requested transformation* — any edit to it invalidates the signature — but it is not access control. Measured evidence is in [Cloudinary Integration](docs/CLOUDINARY.md).
- An artifact is tamper-evident evidence of what was recorded and assessed at that moment. It is not proof that the photograph is authentic, and it is not immutable.

## QR code and public verification page (Phase 6 — implemented)

Every artifact carries a QR code, printed bottom-left, that resolves to `{NEXT_PUBLIC_APP_URL}/verify/{recordId}` — a public page anyone can open with no login and no API key.

- The QR is generated in application code (`src/lib/qr/qr.ts`) as a deterministic grayscale PNG with no image dependency, then uploaded to Cloudinary as `provera/qr-<recordId>` so the CDN can composite it. Re-running a request replaces the same asset, keeping the artifact URL and its signature stable.
- Correctness is tested, not assumed: `src/lib/qr/qr.test.ts` decodes the generated PNG with an independent decoder (jsQR) and asserts it resolves to the exact destination URL.
- The code encodes a URL and nothing else — no score, verdict or hash — so the page is the only source of those values.
- The page shows the recorded assessment in full (status, score, signal breakdown with the underlying measurements, coverage, reasons, flags, timestamp, engine version) and recomputes the record hash so a reader can see whether the record still matches itself. It never states that the photograph is authentic.
- Malformed IDs and unknown-but-valid IDs get their own honest states; a missing record is never reported as a passed or failed verification.
- The QR only resolves for the configured application URL: if the deployment moves, previously printed artifacts point at the old host.

## Build order

Follow `docs/BUILD_PLAN.md` exactly. Do not ask Cline to build the whole application in one prompt. Complete one phase, test it, review the diff, commit it, then move to the next phase.

## Final submission checklist

- Track 1 selected
- Public GitHub repository
- README with problem, track, Cloudinary usage and setup
- Working demo where possible
- 2–4 minute demo video
- No API keys or credentials in GitHub
- Cloudinary feedback survey completed by every participant
- Submission completed before the code freeze

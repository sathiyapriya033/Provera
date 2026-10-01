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

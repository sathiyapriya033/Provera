# Provera — Build Plan

## Phase 0 — Repository baseline

- Create/clone public GitHub repository
- Add documentation
- Add README
- Add `.gitignore`
- Add `.env.example`
- Commit clean baseline

## Phase 1 — Cloudinary foundation

- Initialize Next.js
- Configure Cloudinary
- Implement secure upload
- Display uploaded asset
- Verify Cloudinary asset identity

**Done when:** a real image is uploaded and displayed through the Cloudinary workflow.

## Phase 2 — Analysis

- Implement one reliable supported Cloudinary analysis/OCR/visual workflow
- Normalize results
- Display raw/normalized signal summary

**Done when:** the demo can show Cloudinary-produced analysis signals for a real upload.

## Phase 3 — Forensic engine

- Implement five weighted signals
- Implement deterministic score
- Implement status thresholds
- Implement reason generation
- Add tests

**Done when:** identical inputs always produce identical results and the UI explains the score.

## Phase 4 — Verification record

- Generate record ID
- Canonicalize record
- Hash record with SHA-256
- Attach structured metadata to Cloudinary asset
- Store engine version

**Done when:** the asset and verification state are visibly connected.

## Phase 5 — Signed artifact

- Build dynamic Cloudinary transformation
- Add status, score, record ID and short hash
- Add signed delivery
- Demonstrate `f_auto` / `q_auto`

**Done when:** a signed transformed artifact is generated from the managed asset.

## Phase 6 — QR verification

- Generate QR pointing to `/verify/[recordId]`
- Build verification page
- Show record details and signal breakdown

**Done when:** a phone can scan/open the QR and retrieve the verification record.

## Phase 7 — Inspector Mode

Expose the Cloudinary workflow directly:

- asset ID
- upload result
- analysis summary
- metadata
- transformation parameters
- signed URL
- optimization parameters
- record ID

## Phase 8 — Audit queue

Only after MVP stability:

- metadata-backed retrieval
- status filter
- score filter
- recent records

Avoid adding a database unless genuinely required.

## Phase 9 — Hardening

- clean case
- suspicious case
- inconsistent case
- invalid input
- missing analysis
- invalid record
- responsive UI
- secret scan
- lint/type/build checks

## Phase 10 — Submission

- README finalized
- public GitHub checked
- live demo checked
- 2–4 minute video
- Cloudinary feedback survey completed
- final submission before code freeze

## Four-day target

### Day 1
Ingestion + Cloudinary upload

### Day 2
Analysis + forensic engine

### Day 3
Metadata + signed artifact + QR + Inspector

### Day 4
Hardening + README + demo + survey + submission

## Definition of done

The complete demo must visibly execute:

Upload → Cloudinary analysis → deterministic score → structured metadata → signed artifact → QR verification → Inspector Mode.

# Cline Workflow

## Purpose

Cline is the implementation assistant. The project specification remains the source of truth.

## Rules for every Cline task

1. Read the relevant documentation before editing code.
2. Inspect the existing repository before creating files.
3. Implement only the current build phase.
4. Do not add an external service unless the current phase requires it.
5. Keep Cloudinary as an active part of the media workflow.
6. Do not invent unsupported Cloudinary capabilities.
7. Do not expose secrets in source code.
8. Keep the forensic score deterministic and explainable.
9. Do not make authenticity, fraud-probability, immutability, or legal claims beyond the specification.
10. Run the relevant checks after implementation.
11. Report changed files, tests/checks, remaining issues and any assumptions.
12. Review the diff before committing.

## Standard prompt

Use this pattern:

> Read `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/CLOUDINARY.md`, and `docs/BUILD_PLAN.md`. We are implementing **Phase X only**. First inspect the repository and identify the files relevant to this phase. Then implement the smallest complete version that satisfies the phase requirements. Do not implement later phases. Keep Cloudinary as an active part of the workflow and follow the documented non-claims. Run the relevant lint/type/test/build checks. At the end, report: files changed, behavior implemented, checks run, errors remaining, and anything I must do manually.

## Phase prompts

### Phase 0 — Repository baseline
Read `docs/BUILD_PLAN.md`. Prepare the repository for the Next.js application without creating unnecessary infrastructure.

### Phase 1 — Cloudinary foundation
Read `docs/CLOUDINARY.md` and `docs/ARCHITECTURE.md`. Implement secure Cloudinary configuration, upload flow and uploaded-asset display. Do not implement forensic scoring yet.

### Phase 2 — Analysis
Read `docs/CLOUDINARY.md`, `docs/FORENSIC_ENGINE.md`, and `docs/API_CONTRACT.md`. Implement one reliable supported analysis/OCR/visual workflow and normalize its result into the application's signal model.

### Phase 3 — Forensic engine
Read `docs/FORENSIC_ENGINE.md`. Implement deterministic scoring, status classification, reason generation and tests. Do not describe the score as a fraud probability.

### Phase 4 — Verification record
Read `docs/VERIFICATION_MODEL.md` and `docs/API_CONTRACT.md`. Implement canonical verification records, record hashing and persistence through the agreed MVP metadata layer.

### Phase 5 — Signed artifact
Read `docs/CLOUDINARY.md` and `docs/VERIFICATION_MODEL.md`. Implement the dynamic transformed artifact, signed delivery and optimized delivery.

### Phase 6 — QR verification
Read `docs/UI_SPEC.md` and `docs/VERIFICATION_MODEL.md`. Implement QR generation and `/verify/[recordId]`.

### Phase 7 — Inspector Mode
Read `docs/UI_SPEC.md` and `docs/CLOUDINARY.md`. Expose Cloudinary asset ID, upload result, analysis summary, metadata, transformation parameters, signed delivery URL, optimization parameters and verification record ID.

### Phase 8 — Audit queue
Implement only if the core MVP is stable. Use structured metadata for filtering/retrieval rather than introducing a database unless necessary.

### Phase 9 — Hardening
Test clean, suspicious and inconsistent scenarios. Check responsive UI, errors, missing analysis data, invalid records and secret handling.

### Phase 10 — Submission
Polish README, record the 2–4 minute demo, verify the public repository, complete the required survey and prepare the final submission.

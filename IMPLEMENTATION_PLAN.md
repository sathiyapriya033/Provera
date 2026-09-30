# Provera — Master Implementation Plan

**Project:** Provera
**Team:** Vermithor
**Hackathon:** Pixels to Products — Cloudinary AI Hackathon 2026
**Track:** Track 1 — AI Media Pipelines
**Document type:** Master implementation plan and execution contract
**Status:** Active
**Repository:** Provera

---

# 1. Purpose of This Document

This document is the single source of truth for implementing Provera.

Cline must use this plan to determine:

* What needs to be built.
* The order in which features must be implemented.
* The technical specifications and architectural boundaries.
* The acceptance criteria for each phase.
* Which commands and tests must be run.
* When a phase is complete.
* When implementation must stop because a dependency, credential, or requirement is missing.

The user will control execution by issuing commands such as:

* `Proceed with Phase 0.`
* `Proceed with Phase 1.`
* `Evaluate Phase 1 against IMPLEMENTATION_PLAN.md without changing code.`
* `Fix only the failures in Phase 1.`
* `Explain the Phase 2 implementation before proceeding.`

Do not implement all phases at once.

Implement only the phase explicitly requested by the user. After completing it, report the result and wait for the user's next instruction.

---

# 2. Product Overview

## 2.1 Product Name

Provera

## 2.2 Product Statement

Provera turns field media into an audit-ready verification artifact by combining Cloudinary's media pipeline with transparent forensic consistency checks and signed verification records.

## 2.3 Problem

Images and other field media are frequently shared without sufficient context about their origin, available metadata, content, or verification history.

Reviewers need a practical way to inspect available media signals, understand potential inconsistencies, and access a traceable verification record.

## 2.4 Proposed Solution

Provera allows a user to:

1. Upload an image through Cloudinary.
2. Process the uploaded asset using a real Cloudinary-supported media-analysis workflow.
3. Normalize the available metadata, OCR, visual, duplicate, and media-quality signals.
4. Calculate a deterministic Forensic Consistency Score.
5. Display the score, status, and reasons transparently.
6. Store relevant verification metadata with the Cloudinary asset.
7. Generate a verification record and integrity hash.
8. Produce a signed Cloudinary verification artifact.
9. Generate a QR code linking to the verification page.
10. Inspect the underlying Cloudinary workflow through Inspector Mode.

## 2.5 Intended Users

* Field investigators.
* Journalists and media reviewers.
* Organizations reviewing submitted images.
* Teams that need a traceable media-review workflow.

## 2.6 Important Product Boundary

Provera is a **media consistency and verification-support tool**.

It must not claim that its score establishes whether an image is historically authentic or proves that an image is genuine or fraudulent.

The score represents the consistency of the signals available to the system. It is not a scientifically validated probability of fraud.

A cryptographic hash or signed artifact can help establish the integrity of a particular record or artifact. It does not, by itself, prove that the original image is authentic, unaltered before upload, or factually accurate.

Use clear language throughout the interface, documentation, and demo.

---

# 3. Core Product Workflow

The intended end-to-end workflow is:

1. User uploads an image.
2. Cloudinary stores the asset.
3. Provera retrieves the asset's relevant information.
4. Cloudinary-supported analysis produces available media signals.
5. Provera normalizes those signals into a consistent internal format.
6. The forensic engine calculates the score and status.
7. The UI displays the score, status, signals, and reasons.
8. Provera creates a verification record.
9. The record is associated with the Cloudinary asset.
10. Provera creates an integrity hash.
11. Provera generates a signed Cloudinary verification artifact.
12. A QR code links to the public verification page.
13. The verification page displays the record.
14. Inspector Mode exposes the relevant Cloudinary operations.

The final implementation must use real Cloudinary operations. Do not substitute mocked responses for the core demonstration.

---

# 4. Technical Foundation

## 4.1 Required Technology Stack

Use the following stack unless a genuine compatibility issue requires a documented change.

* Next.js with App Router.
* TypeScript.
* React.
* Tailwind CSS.
* Lucide icons.
* Cloudinary Upload Widget or Cloudinary upload API.
* Cloudinary Node.js SDK where appropriate.
* `next-cloudinary` where useful.
* `@cloudinary/url-gen` for URL and transformation construction.
* Next.js Route Handlers or Server Actions for server-side operations.
* Node.js `crypto` for record hashing and cryptographic operations.
* Cloudinary structured metadata where supported and configured.
* QR-code generation library.
* Git and GitHub.

Use the current stable, mutually compatible package versions available when the phase is implemented. Do not blindly copy obsolete APIs from tutorials.

## 4.2 Architectural Principles

1. Cloudinary must be an active part of the product, not merely a place to store static images.
2. Keep Cloudinary-specific operations behind a small service or adapter layer.
3. Keep forensic scoring independent from UI components and Cloudinary SDK calls.
4. Keep all secret credentials on the server.
5. Use TypeScript types for analysis signals, scores, records, and API responses.
6. Make scoring deterministic and explainable.
7. Keep the implementation as simple as possible for a hackathon MVP.
8. Do not introduce a database, authentication system, or external forensic service unless the requirements genuinely need it.
9. Do not fabricate analysis results when a service is unavailable.
10. Prefer readable, maintainable code over unnecessary abstraction.

---

# 5. Repository Structure

Inspect the existing repository before creating or moving files.

The intended structure is:

```text
Provera/
├── app/
│   ├── api/
│   │   ├── analyze/
│   │   ├── verify/
│   │   └── artifact/
│   ├── verify/
│   │   └── [recordId]/
│   ├── inspector/
│   ├── audit/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── upload/
│   ├── results/
│   ├── verification/
│   ├── inspector/
│   └── ui/
├── lib/
│   ├── cloudinary/
│   ├── analysis/
│   ├── forensic/
│   ├── verification/
│   ├── validation/
│   └── utils/
├── types/
├── tests/
├── public/
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── CLOUDINARY.md
│   ├── FORENSIC_ENGINE.md
│   ├── VERIFICATION_MODEL.md
│   ├── API_CONTRACT.md
│   ├── UI_SPEC.md
│   ├── BUILD_PLAN.md
│   └── CLINE_WORKFLOW.md
├── IMPLEMENTATION_PLAN.md
├── README.md
├── .env.example
├── .gitignore
├── package.json
└── ...
```

This is a target structure, not a requirement to create every directory immediately.

Create files only when needed by the current phase. Preserve the existing Git repository, documentation, and user-created work.

Do not create a nested `Provera/Provera` project.

---

# 6. Environment and Secrets

## 6.1 Required Local Tools

Verify that the following are installed:

* Git.
* Node.js compatible with the selected Next.js version.
* npm.
* Visual Studio Code.
* Cline extension.
* A Cloudinary account.

Before implementation, inspect the installed versions rather than assuming they are available.

## 6.2 Environment Variables

Use `.env.local` for local secrets. Keep `.env.example` in the repository with blank values.

Required variables:

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Rules:

* Never put the Cloudinary API secret in client-side code.
* Never commit `.env.local`.
* Never expose private credentials in API responses, logs, screenshots, or the demo.
* Validate required environment variables when the relevant service is initialized.
* Provide useful configuration errors without printing secret values.
* Do not invent credentials or pretend that Cloudinary is configured when it is not.

---

# 7. Global Rules for Cline

These rules apply to every phase.

## 7.1 Before Implementation

When the user says `Proceed with Phase N`:

1. Read this entire `IMPLEMENTATION_PLAN.md`.
2. Read the relevant specification documents in `docs/`.
3. Inspect the repository structure and Git status.
4. Inspect the existing implementation.
5. Identify the acceptance criteria for Phase N.
6. Identify dependencies and prerequisites.
7. State any blocking issue before making changes.

Do not overwrite existing work without inspecting it.

## 7.2 During Implementation

* Implement only the requested phase.
* Do not start later phases.
* Do not rewrite unrelated components.
* Do not silently change product requirements.
* Do not add unnecessary dependencies.
* Do not use fake Cloudinary data in place of required live functionality.
* Do not suppress errors merely to make a test pass.
* Do not weaken acceptance criteria to declare success.
* Do not change this master plan without explicit user approval.
* If a requirement is ambiguous, choose the smallest reasonable implementation consistent with this plan and document the assumption.
* If a requirement cannot be completed, report it honestly.

## 7.3 Testing

Run the checks appropriate to the current phase.

At minimum, use the project's available commands for:

* Linting.
* Type checking, if configured.
* Unit tests, if configured.
* Production build.

Do not claim a command passed unless it was actually run and completed successfully.

If a check cannot run because of missing credentials, unavailable services, or environment restrictions, report it as blocked or not run.

## 7.4 After Implementation

1. Inspect the final diff.
2. Check for accidental unrelated changes.
3. Check for exposed secrets.
4. Run relevant tests.
5. Evaluate every acceptance criterion.
6. Report PASS, FAIL, or BLOCKED.
7. Stop and wait for the user's next instruction.

## 7.5 Required Phase Report

Use this exact report structure:

```text
PHASE:
STATUS: PASS / FAIL / BLOCKED

SUMMARY:
...

FILES CREATED:
- ...

FILES MODIFIED:
- ...

FEATURES IMPLEMENTED:
- ...

ACCEPTANCE CRITERIA:
- [PASS/FAIL/BLOCKED] ...

CHECKS RUN:
- Command:
  Result:

MANUAL ACTION REQUIRED:
- ...

KNOWN ISSUES:
- ...

READY FOR NEXT PHASE: YES / NO
```

A phase can be marked PASS only when all mandatory acceptance criteria are satisfied.

If any mandatory criterion fails, mark the phase FAIL.

If progress depends on an unavailable credential, external service, or user action, mark it BLOCKED when that dependency prevents meaningful completion.

---

# 8. Phase 0 — Repository and Next.js Foundation

## Goal

Prepare the existing Provera repository for application development.

## Tasks

1. Inspect the existing Git repository and files.
2. Verify Node.js, npm, and Git versions.
3. Check the current repository state.
4. Initialize the Next.js application in the repository root.
5. Configure TypeScript.
6. Configure Tailwind CSS.
7. Configure ESLint.
8. Configure the import alias.
9. Create the initial App Router structure.
10. Create a minimal Provera application shell.
11. Preserve existing documentation and configuration files.
12. Confirm `.gitignore` excludes secrets, dependencies, and build output.
13. Confirm `.env.example` exists.
14. Add useful package scripts for development, linting, building, and testing as appropriate.

If the repository is not empty, do not blindly run a project generator that might overwrite existing files. Inspect the current state and use a safe initialization approach.

## Initial UI

Create a simple application shell containing:

* Provera branding.
* A brief product description.
* Navigation placeholders for the main workflow, Inspector, and verification.
* A clean, responsive layout.
* A clear loading or placeholder state where functionality has not yet been implemented.

Do not implement the actual upload or analysis workflow in this phase.

## Acceptance Criteria

* The Next.js application exists in the repository root.
* Existing documentation remains intact.
* The application starts locally.
* The main page renders.
* Linting passes.
* The production build passes.
* No credentials are committed.
* No unnecessary nested project exists.

## Completion

Stop after reporting the result. Do not proceed to Phase 1 automatically.

---

# 9. Phase 1 — Cloudinary Configuration and Upload

## Goal

Connect Provera to Cloudinary and implement a real image-upload workflow.

## Tasks

1. Create a centralized Cloudinary configuration module.
2. Validate the required environment variables.
3. Implement a server-side Cloudinary service or adapter.
4. Implement the upload flow using the appropriate Cloudinary upload method.
5. Validate file type and file size.
6. Handle upload errors.
7. Retrieve the uploaded asset's relevant information.
8. Display the uploaded image in the UI.
9. Display the asset's public ID.
10. Keep Cloudinary credentials on the server.
11. Ensure the UI distinguishes upload success from analysis success.

## Upload Requirements

The upload interface should provide:

* A clear upload action.
* A loading state.
* File validation feedback.
* Upload progress where supported by the chosen method.
* A success state.
* An error state.
* An uploaded-image preview.
* The Cloudinary public ID.

Only accept the file types required by the MVP.

## Acceptance Criteria

* A real image can be uploaded to Cloudinary.
* The asset exists in the Cloudinary account.
* The application receives the actual asset information.
* The uploaded image is displayed.
* Upload failures are handled.
* No mocked upload success is used.
* No secret is exposed to the browser.

---

# 10. Phase 2 — Cloudinary Media Analysis

## Goal

Build a real, reliable analysis workflow using Cloudinary-supported capabilities.

## Tasks

1. Review Cloudinary's currently available analysis, OCR, and visual-information capabilities.
2. Select the smallest reliable workflow that supports the MVP.
3. Verify that the chosen capabilities are available for the configured account and assets.
4. Implement the analysis call through the Cloudinary adapter.
5. Normalize the returned data into a stable internal format.
6. Handle missing fields and unavailable analysis capabilities.
7. Display the available analysis summary.
8. Record which signals were actually obtained.
9. Expose relevant analysis details to Inspector Mode in a later phase.

Do not assume that every Cloudinary account or plan exposes every analysis feature.

Do not invent a Cloudinary API response format. Check the actual SDK or API documentation for the selected capability.

## Normalized Analysis Signals

Define a typed internal representation covering:

* Metadata availability.
* OCR or text-related signals.
* Visual or content-consistency signals.
* Duplicate or fingerprint indicators.
* Media-quality or analysis signals.

Use `null`, an explicit unavailable state, or an equivalent typed representation when a signal cannot be obtained.

Do not automatically treat an unavailable signal as a suspicious result.

## Acceptance Criteria

* Analysis is connected to a real Cloudinary-supported workflow.
* The application receives actual analysis data.
* The response is normalized into a stable typed structure.
* Missing or unsupported signals are handled explicitly.
* Analysis failures do not crash the application.
* The UI does not present fabricated results as real analysis.
* The implementation documents any capability or account limitations.

---

# 11. Phase 3 — Deterministic Forensic Consistency Engine

## Goal

Calculate a transparent, repeatable score from the available normalized signals.

## Score Components

Use these initial weights:

| Signal                            |   Weight |
| --------------------------------- | -------: |
| Metadata availability             |      20% |
| OCR / claim consistency           |      25% |
| Visual / content consistency      |      25% |
| Duplicate / fingerprint indicator |      20% |
| Media quality / analysis signals  |      10% |
| **Total**                         | **100%** |

These weights are product-defined heuristic weights, not scientifically validated measurements.

## Status Thresholds

| Score  | Status   |
| ------ | -------- |
| 80–100 | VERIFIED |
| 50–79  | REVIEW   |
| 0–49   | FLAGGED  |

The UI must explain that VERIFIED means the available signals meet Provera's configured consistency threshold. It does not mean that authenticity has been proven.

## Tasks

1. Create a standalone forensic-engine module.
2. Define TypeScript types for inputs and outputs.
3. Normalize the input signals before scoring.
4. Implement the weighted scoring logic.
5. Implement the status thresholds.
6. Generate human-readable reasons for the result.
7. Handle missing and unavailable signals.
8. Avoid counting unavailable data as a confirmed inconsistency.
9. Include a scoring-engine version.
10. Add unit tests for scoring, thresholds, missing data, and edge cases.

## Determinism

The same normalized input and engine version must produce the same score, status, and reasons.

Do not use random values, current time, or nondeterministic external calls inside the scoring calculation.

## Explainability

For every score, provide:

* Overall score.
* Status.
* Component-level signal results.
* The contribution or interpretation of each signal.
* Reasons for concerns.
* Unavailable signals.
* Scoring-engine version.

## Acceptance Criteria

* The scoring engine is independent of UI and Cloudinary SDK code.
* All weights are explicit.
* All weights sum to 100%.
* Status thresholds are implemented correctly.
* Missing-data handling is documented.
* The same input produces the same output.
* Unit tests cover all thresholds and important edge cases.
* The UI does not describe the score as a probability of fraud.

---

# 12. Phase 4 — Verification Records and Integrity Hash

## Goal

Create a structured verification record for every completed analysis.

## Verification Record

Define a typed record containing, as appropriate:

* Record ID.
* Cloudinary public ID.
* Asset URL or permitted asset reference.
* Creation timestamp.
* Score.
* Status.
* Normalized signals.
* Human-readable reasons.
* Scoring-engine version.
* Record schema version.
* Integrity hash.

Use a record ID format similar to:

`PV-2026-XXXXXXXX`

The implementation must avoid accidental collisions and must not rely on the record ID alone as proof of integrity.

## Tasks

1. Define the verification-record schema.
2. Generate a unique record ID.
3. Use a consistent timestamp format.
4. Define canonical serialization.
5. Ensure canonical serialization has deterministic field ordering.
6. Calculate a SHA-256 hash using Node.js crypto.
7. Define exactly which fields are included in the hash.
8. Exclude the hash field itself from the canonical hash input.
9. Store the record using the simplest reliable persistence approach.
10. Associate relevant verification metadata with the Cloudinary asset where supported.
11. Return the record ID and hash to the application.

## Cloudinary Metadata

Use structured metadata where supported and configured.

Proposed fields:

* `provera_status`
* `provera_score`
* `provera_record_id`
* `provera_record_hash`
* `provera_timestamp`
* `provera_version`
* `provera_flags`

Confirm the actual field-creation and update requirements before implementing them.

Do not assume metadata fields already exist in the Cloudinary account.

If Cloudinary metadata configuration requires a manual dashboard action, document the action clearly.

## Persistence

Prefer a simple implementation appropriate for the MVP.

Do not introduce a database unless required for reliable retrieval of verification records.

If persistence is necessary, explain the selected approach, its limitations, and the required environment configuration before introducing it.

Do not pretend that in-memory records provide durable persistence across server restarts.

## Acceptance Criteria

* Every completed analysis has a verification record.
* The record has a unique ID.
* The record contains the relevant score, status, signals, reasons, and version.
* Canonicalization is deterministic.
* The integrity hash can be reproduced from the canonical record data.
* The record is retrievable by ID using the chosen persistence mechanism.
* Cloudinary metadata is attached when configured and supported.
* Persistence limitations are documented honestly.

---

# 13. Phase 5 — Signed Cloudinary Verification Artifact

## Goal

Generate a visual verification artifact using Cloudinary transformations and secure delivery.

## Artifact Contents

The artifact should communicate:

* Provera branding.
* Verification status.
* Score.
* Record ID.
* A short representation of the record hash.
* QR destination or verification URL, where practical.

The artifact should be legible and suitable for the demo.

## Tasks

1. Design the artifact layout.
2. Build its Cloudinary transformation using supported transformation features.
3. Include the required record information.
4. Generate the artifact URL.
5. Use Cloudinary's appropriate signed-delivery mechanism.
6. Keep signing credentials on the server.
7. Apply `f_auto` and `q_auto` where appropriate.
8. Display the artifact in the result interface.
9. Handle transformation or delivery errors.
10. Expose relevant transformation details in Inspector Mode.

Verify the syntax and capabilities of the selected Cloudinary transformations before implementation.

## Security and Claims

* Do not expose signing secrets.
* Do not claim that a signed URL proves that the original image is authentic.
* Do not treat a short hash displayed on an artifact as a substitute for full record verification.
* Do not claim that the artifact is immutable unless the implemented storage and access controls actually provide that property.

## Acceptance Criteria

* A real Cloudinary-generated artifact is produced.
* The artifact displays the required verification information.
* Signed delivery works using the configured Cloudinary setup.
* The artifact is accessible through the intended application flow.
* The URL and transformation details can be inspected.
* Failures are handled without fabricating a successful artifact.

---

# 14. Phase 6 — QR Code and Verification Page

## Goal

Allow another person to open a verification record using a QR code or direct link.

## Verification URL

Use the application URL and record ID:

`{NEXT_PUBLIC_APP_URL}/verify/{recordId}`

Use the configured production URL when deployed.

## Tasks

1. Generate a QR code for the verification URL.
2. Include the QR code in the artifact or result interface.
3. Create the `/verify/[recordId]` page.
4. Retrieve the requested verification record.
5. Display the record's score and status.
6. Display the timestamp.
7. Display available signals and reasons.
8. Display the record ID and integrity hash.
9. Display relevant Cloudinary asset information.
10. Handle invalid or missing record IDs.
11. Handle unavailable records and retrieval failures.
12. Make the page responsive.

## Verification Page States

Implement:

* Loading.
* Record found.
* Record not found.
* Invalid record ID.
* Retrieval error.

The page must distinguish successful record retrieval from a claim about the image's historical authenticity.

## Acceptance Criteria

* Every generated QR code points to the correct record.
* The verification page retrieves the correct record.
* Direct navigation to a verification URL works.
* Invalid and missing records are handled.
* The page displays the record's actual data.
* The page does not claim that a record hash alone proves authenticity.

---

# 15. Phase 7 — Inspector Mode

## Goal

Make Cloudinary's role in the product visible and understandable to a reviewer or judge.

## Route

`/inspector`

Inspector Mode should be accessible from the main application.

## Required Information

Show relevant information from the actual workflow:

* Cloudinary public ID.
* Upload result.
* Asset information.
* Analysis workflow and summary.
* Available normalized signals.
* Structured metadata fields and values.
* Verification record ID.
* Record hash.
* Artifact transformation details.
* Signed-delivery information that is safe to expose.
* Use of `f_auto` and `q_auto`, when applied.
* Relevant Cloudinary operation results.

## Security

Never display:

* API secrets.
* Private signing credentials.
* Environment-variable contents.
* Sensitive server configuration.

Do not expose a private signed URL if doing so would reveal a secret or violate the intended access model.

## UX

Inspector Mode should help a reviewer answer:

1. What did Cloudinary do?
2. Which analysis signals were obtained?
3. Which metadata was stored?
4. How was the verification artifact generated?
5. How can the displayed record be retrieved?

## Acceptance Criteria

* Inspector Mode displays actual workflow information.
* It does not rely on fabricated Cloudinary events.
* Cloudinary's role is clear.
* Sensitive credentials are not exposed.
* The interface is usable during the live demo.

---

# 16. Phase 8 — Audit Queue

## Goal

Provide a simple way to review previously processed assets.

This is a secondary feature. Complete the core upload-to-verification workflow before implementing it.

## Route

`/audit`

## Tasks

1. Retrieve available verification records.
2. Display records in a readable list or table.
3. Show record ID, date, score, and status.
4. Add status filtering.
5. Add score filtering if practical.
6. Allow navigation to a record's verification page.
7. Provide loading, empty, and error states.

Use the persistence mechanism established in Phase 4.

Do not add a new database solely for the audit queue unless the current storage approach cannot support the required functionality.

## Acceptance Criteria

* Previously processed records can be listed.
* Filters operate on actual record data.
* Each record links to the correct verification page.
* Empty and error states work.
* The feature does not compromise the core workflow.

---

# 17. Phase 9 — Hardening, Testing, and Reliability

## Goal

Make the MVP reliable enough for a public demo and submission.

## Functional Test Scenarios

Test the following:

1. A normal image upload.
2. An upload with incomplete metadata.
3. An image with readable text, if supported by the analysis workflow.
4. An image with inconsistent or unavailable signals.
5. An unsupported file type.
6. A file that exceeds the configured size limit.
7. A failed upload.
8. An unavailable analysis capability.
9. An analysis response with missing fields.
10. A metadata update failure.
11. A verification-record retrieval failure.
12. An invalid record ID.
13. An artifact-transformation failure.
14. A signed-delivery failure.
15. A missing Cloudinary environment variable.

## Reliability Requirements

* Errors must be visible and understandable.
* Loading states must not persist indefinitely.
* Missing data must not silently become fabricated data.
* Failed operations must not create misleading success messages.
* A failed optional feature must not unnecessarily crash the entire application.
* API responses must not expose secrets or stack traces.
* User input must be validated on the server where appropriate.

## Security Review

Check:

* Environment-variable handling.
* Upload validation.
* Server-side credential usage.
* API input validation.
* Error responses.
* Signed URL handling.
* Accidental secret exposure.
* Unnecessary public access to sensitive resources.

## Accessibility and Responsiveness

Check:

* Mobile layout.
* Keyboard navigation.
* Visible focus states.
* Readable contrast.
* Labels for form controls.
* Useful error messages.
* Appropriate alternative text for images.

## Acceptance Criteria

* Critical workflow tests pass.
* Linting passes.
* Type checking passes, if configured.
* Unit tests pass.
* Production build passes.
* Important failure states are handled.
* No secrets are exposed.
* The app works at the target demo viewport sizes.

---

# 18. Phase 10 — Demo and Hackathon Submission

## Goal

Prepare Provera for a clear, working demonstration and complete the submission requirements.

## Demo Structure — Approximately 3 Minutes

### 0:00–0:20 — Problem

Explain why reviewers need a transparent way to inspect field media and its available evidence.

### 0:20–0:40 — Upload

Upload an image and show that Cloudinary receives the asset.

### 0:40–1:10 — Cloudinary Analysis

Show the actual analysis workflow and available OCR, visual, or metadata signals.

### 1:10–1:35 — Forensic Consistency Score

Show the score, status, component signals, and human-readable reasons.

Explain that the score is a consistency heuristic, not a probability of fraud.

### 1:35–1:55 — Inspector Mode

Show the Cloudinary asset, analysis information, metadata, and transformation details.

### 1:55–2:25 — Verification Artifact

Generate and display the signed Cloudinary verification artifact.

### 2:25–2:45 — QR Verification

Scan the QR code or open the verification URL. Show the corresponding record.

### 2:45–3:00 — Closing

Summarize how Provera connects media processing, transparent checks, and a retrievable verification record.

## README Requirements

The final README must explain:

* What Provera does.
* The problem it addresses.
* The selected hackathon track.
* How Cloudinary is used.
* The architecture and workflow.
* The forensic score and its limitations.
* How to configure the project.
* How to run it locally.
* How to test it.
* How to deploy or access the demo.
* Known limitations.
* The demonstration workflow.

## Submission Checklist

* [ ] Public GitHub repository.
* [ ] Complete README.
* [ ] Setup instructions.
* [ ] `.env.example`.
* [ ] No committed secrets.
* [ ] Working application.
* [ ] Real Cloudinary workflow.
* [ ] Forensic scoring with visible reasons.
* [ ] Verification record.
* [ ] Signed artifact.
* [ ] QR verification.
* [ ] Inspector Mode.
* [ ] Demo scenarios tested.
* [ ] Demo video recorded.
* [ ] Cloudinary feedback survey completed.
* [ ] Correct track and problem statement selected on the hackathon platform.
* [ ] Final submission completed before the published deadline.

Do not claim that a submission step is complete unless it has actually been completed.

---

# 19. Definition of Done

The core MVP is complete only when the following end-to-end workflow works:

```text
REAL IMAGE UPLOAD
        ↓
REAL CLOUDINARY ASSET
        ↓
REAL CLOUDINARY ANALYSIS
        ↓
NORMALIZED SIGNALS
        ↓
DETERMINISTIC FORENSIC SCORE
        ↓
VISIBLE STATUS AND REASONS
        ↓
VERIFICATION RECORD
        ↓
INTEGRITY HASH
        ↓
CLOUDINARY METADATA
        ↓
SIGNED VERIFICATION ARTIFACT
        ↓
QR CODE
        ↓
VERIFICATION PAGE
        ↓
INSPECTOR MODE
```

The implementation must also:

* Pass the relevant tests.
* Pass linting.
* Pass the production build.
* Keep secrets out of the public repository.
* Include setup and usage documentation.
* Explain limitations honestly.
* Be demonstrable without relying on fabricated core results.

If an optional component cannot be completed, document the limitation. Do not pretend that the full MVP is complete.

---

# 20. Phase Evaluation Rules

At the end of each phase, evaluate every acceptance criterion.

## PASS

Use PASS only when every mandatory criterion for that phase is satisfied and the relevant checks have been run successfully.

## FAIL

Use FAIL if one or more mandatory acceptance criteria are not satisfied.

When a phase fails:

1. List each failed criterion.
2. Identify the relevant files and causes.
3. Explain the minimum corrective work.
4. Wait for the user to request a fix, unless the user explicitly asked for implementation and correction in the same instruction.

## BLOCKED

Use BLOCKED when progress requires something that cannot be completed without an external action or missing prerequisite.

Examples:

* Cloudinary credentials are missing.
* A required Cloudinary capability is not enabled.
* A required dashboard configuration has not been created.
* A necessary deployment URL is not available.

Explain exactly what the user must do to unblock the phase.

## Evaluation-Only Command

When the user says:

`Evaluate Phase N against IMPLEMENTATION_PLAN.md without changing code.`

Cline must:

* Inspect the implementation.
* Run relevant checks where possible.
* Compare the result with the acceptance criteria.
* Report PASS, FAIL, or BLOCKED.
* Make no code changes.

## Fix Command

When the user says:

`Fix only the failures in Phase N.`

Cline must:

* Fix only the failed criteria for that phase.
* Avoid unrelated refactoring.
* Run the relevant checks again.
* Report the new result.

---

# 21. Git Checkpoints

After a phase passes, recommend creating a Git checkpoint.

Example:

```bash
git status
git diff
git add .
git commit -m "feat(phase-0): initialize Provera application"
```

Use a commit message appropriate to the completed phase.

Do not commit:

* `.env.local`
* API secrets.
* Private keys.
* Unrelated user changes.

If the working tree contains unrelated user changes, do not include them in the commit.

The user is responsible for approving and creating the final commit unless explicitly authorizing Cline to do so.

---

# 22. User-Controlled Execution

The user controls which phase runs next.

Valid commands:

```text
Proceed with Phase 0.
Proceed with Phase 1.
Proceed with Phase 2.
Proceed with Phase 3.
Proceed with Phase 4.
Proceed with Phase 5.
Proceed with Phase 6.
Proceed with Phase 7.
Proceed with Phase 8.
Proceed with Phase 9.
Proceed with Phase 10.
```

Other useful commands:

```text
Evaluate Phase N against IMPLEMENTATION_PLAN.md without changing code.

Fix only the failures in Phase N.

Explain the implementation approach for Phase N before changing code.

Review the current phase's diff and security implications.

Summarize the current project status against IMPLEMENTATION_PLAN.md.
```

Replace `N` with the relevant phase number.

---

# Final Instruction to Cline

Treat this file as the master execution contract for Provera.

When the user requests a phase, implement only that phase, follow its specifications, run the appropriate checks, evaluate the acceptance criteria, and provide the required phase report.

Do not automatically continue to the next phase.

Do not mark a phase as complete merely because the code has been written.

A phase is complete only when its mandatory acceptance criteria are satisfied and its result has been honestly evaluated.

Wait for the user's next instruction after every phase.

# Provera — Product Requirements Document

## 1. Product

Provera is a media-forensics workflow that turns uploaded field media into an audit-ready verification artifact.

## 2. Problem

Reviewers often have to connect an original media asset with AI results, textual evidence and a decision manually. Provera keeps the asset, analysis signals, deterministic consistency assessment and verification record connected through the Cloudinary workflow.

## 3. Primary user

An investigator, reviewer or auditor who needs to inspect field media and understand what was analyzed, which signals were observed and why the system assigned its status.

## 4. Core user story

A user uploads an accident or field image. Cloudinary manages the asset and supplies the supported media/analysis signals. Provera applies deterministic rules, creates a score and status, stores structured verification metadata, generates a signed verification artifact and exposes a QR verification page.

## 5. MVP must have

- Cloudinary image upload
- One reliable Cloudinary-supported analysis/OCR/visual workflow
- Deterministic forensic scoring with visible reasons
- Structured metadata attached to the Cloudinary asset
- Dynamic signed verification artifact
- QR verification page
- Inspector Mode showing Cloudinary integration

## 6. Score model

| Signal | Weight |
|---|---:|
| Metadata availability | 20% |
| OCR / claim consistency | 25% |
| Visual/content consistency | 25% |
| Duplicate/fingerprint indicator | 20% |
| Media quality / analysis signals | 10% |

These are implementation weights, not scientific fraud probabilities.

## 7. Statuses

- VERIFIED
- REVIEW
- FLAGGED

Initial thresholds may be:

- 80–100: VERIFIED
- 50–79: REVIEW
- 0–49: FLAGGED

Thresholds and missing-data behavior must be centralized and documented.

## 8. Should have

- Searchable audit queue
- Status/score filters
- `f_auto` and `q_auto`
- Clean, suspicious and inconsistent demo scenarios

## 9. Cut if time is limited

- Mandatory external forensic services
- Complex authentication
- Unnecessary real-time infrastructure
- External database when the metadata layer is sufficient
- Automated legal/fraud determinations

## 10. Success criteria

The complete demo should visibly show:

Upload → Cloudinary analysis → deterministic score → structured metadata → signed artifact → QR verification → Inspector Mode.

## 11. Non-goals

Provera does not prove historical authenticity, provide a scientifically validated fraud probability, make a legally binding fraud determination, or claim that a SHA-256 record hash makes the original photograph immutable.

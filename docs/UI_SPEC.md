# Provera — UI Specification

## Design goal

The interface should feel like an evidence-review tool rather than a generic AI demo. The score must be understandable at a glance while the Inspector Mode exposes the actual Cloudinary workflow.

## Routes

### `/`

Main upload and analysis experience.

### `/verify/[recordId]`

Public verification page reached from QR.

### `/inspector`

Cloudinary integration inspection view.

### `/audit`

Optional searchable audit queue.

## Home flow

1. Select/upload field image.
2. Show upload progress.
3. Display Cloudinary-managed asset.
4. Collect optional claim/context.
5. Run analysis.
6. Show signal results.
7. Calculate score.
8. Show status and reasons.
9. Generate verification artifact.
10. Present QR verification action.

## Result card

Must display:

- Status
- Score
- Short explanation
- Signal breakdown
- Reasons
- Record ID
- Timestamp
- Verification artifact
- QR action

## Signal breakdown

Show all five categories:

- Metadata availability
- OCR / claim consistency
- Visual/content consistency
- Duplicate/fingerprint indicator
- Media quality / analysis signals

The UI should explain that these are consistency signals, not scientific fraud probabilities.

## Inspector Mode

Display:

- Cloudinary public ID
- upload response summary
- analysis summary
- structured metadata
- transformation parameters
- signed delivery URL
- `f_auto`
- `q_auto`
- verification record ID

## Verification page

The QR destination must be readable on mobile and should show the recorded verification state without requiring a login.

## Error states

Provide explicit states for:

- unsupported file
- upload failure
- analysis unavailable
- missing OCR
- verification failure
- artifact generation failure
- record not found

## Accessibility

- keyboard-accessible controls
- visible focus states
- meaningful labels
- sufficient text contrast
- status not communicated only by color
- responsive mobile layout

## Demo scenarios

Prepare:

1. Clean / consistent
2. Suspicious
3. Inconsistent

The scenarios should demonstrate different signals rather than relying on arbitrary fake AI outputs.

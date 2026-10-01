# Provera — Forensic Consistency Engine

## Purpose

The engine produces an explainable consistency assessment from observable signals. It is not an authenticity detector and does not output a scientifically validated fraud probability.

## Inputs

- Media metadata availability
- OCR output
- User-supplied claim/context
- Visual/content analysis
- Duplicate/fingerprint indicator
- Media quality/analysis signals

## Weights

| Signal | Weight |
|---|---:|
| Metadata availability | 20 |
| OCR / claim consistency | 25 |
| Visual/content consistency | 25 |
| Duplicate/fingerprint indicator | 20 |
| Media quality / analysis signals | 10 |

## Score

Normalize each available signal to 0–100, then calculate:

```text
score =
  metadata * 0.20 +
  ocrClaim * 0.25 +
  visualContent * 0.25 +
  duplicate * 0.20 +
  mediaQuality * 0.10
```

Round deterministically according to one documented rule.

## Missing-data rule

Never invent a favorable value for an unavailable signal.

The implementation should explicitly define whether unavailable signals:

1. reduce the maximum achievable score,
2. trigger REVIEW,
3. or use another documented fallback.

Whichever rule is selected must be deterministic, tested and visible in the reason list.

## Status

Initial implementation:

```text
80–100  VERIFIED
50–79   REVIEW
0–49    FLAGGED
```

Centralize these thresholds.

## Explainability

Every score must return reasons such as:

- “Expected metadata was present.”
- “OCR content was consistent with the submitted context.”
- “No duplicate indicator was detected.”
- “Visual content matched the submitted context.”
- “Media quality analysis reported no relevant warning.”

Do not create reasons that are unsupported by actual signals.

## Determinism

Given identical normalized inputs and engine version, the output must be identical.

Test:

- exact boundary scores
- missing signals
- conflicting OCR
- duplicate indicator
- low quality
- all-good scenario
- mixed scenario

## Versioning

Store an engine/version identifier in the verification record so later rule changes do not make old records ambiguous.

## Implementation notes (Phase 3)

Implemented in `src/lib/forensic/engine.ts` (engine version `provera-forensic@1`).

### Chosen missing-data rule (option3 — documented fallback)

Unavailable or errored signals are **excluded from both the weighted sum and
the weight total** (renormalized). They neither inflate nor penalize the score:

```text
score = round( Σ(weight × componentScore) for scoreable signals
              / Σ(weight for scoreable signals) )
```

* The resulting `coverage` (scoreable weight out of100) is reported with every
  result, and every exclusion appears in the reason list and in
  `unavailableSignals`.
* Unavailable data is never imputed, never scored as a confirmed
  inconsistency, and never granted a favorable default value.
* Special case: when coverage is0 (no scoreable signal), the result is
  inconclusive — score0, status REVIEW, with an explicit reason.
* Rounding is `Math.round` (half away from zero for positive values).

### Component rubrics (all deterministic)

| Component | Rule |
| --- | --- |
| Metadata availability | +40 image-metadata fields present, +30 EXIF fields present, +15 original filename retained, +15 etag present |
| OCR / claim consistency | Term overlap between the normalized claim and detected image text; unavailable when OCR, text, or a claim is missing |
| Visual / content consistency | Starts at100; −40 illustration score ≥0.5 (−15 if ≥0.1), −15 semi-transparent, −10 grayscale; clamped at0 |
| Duplicate / fingerprint | `round(min(nearest Hamming distance,16)/16 ×100)` over64-bit perceptual hashes; concern at ≤8 bits; unavailable with no reference hashes |
| Media quality | Cloudinary focus score (0–1) ×100; concern below0.3 |

Unit tests covering thresholds, weighting, missing data, edge cases and
determinism live in `src/lib/forensic/engine.test.ts` (`npm test`, zero
additional dependencies — Node's built-in test runner).

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

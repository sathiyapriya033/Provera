# Provera — Architecture

## High-level flow

```text
Field Image
    |
    v
Provera UI
    |
    v
Cloudinary Upload
    |
    v
Cloudinary Asset
    |
    +--> Supported AI / media analysis
    +--> OCR / visual signals
    |
    v
Application Forensic Engine
    |
    +--> Metadata availability
    +--> OCR / claim consistency
    +--> Visual/content consistency
    +--> Duplicate/fingerprint indicator
    +--> Media quality / analysis signals
    |
    v
Forensic Consistency Score + Status
    |
    v
Cloudinary Structured Metadata
    |
    v
Verification Record + Record Hash
    |
    v
Signed Dynamic Transformation
    |
    +--> Status
    +--> Score
    +--> Record ID
    +--> QR
    |
    v
Optimized Cloudinary CDN Delivery
    |
    v
Verification / Audit UI
```

## Responsibility boundaries

### Cloudinary

- Media ingestion
- Asset management
- Supported AI/media analysis
- OCR/visual capabilities where supported
- Structured metadata
- Search
- Transformations
- Signed delivery
- `f_auto` / `q_auto`
- CDN delivery

### Application

- Workflow orchestration
- Context/claim input
- Signal normalization
- Deterministic scoring
- Status classification
- Reason generation
- Verification record construction
- QR routing
- Inspector presentation

## Suggested repository structure

```text
src/
  app/
    api/
      analyze/
      verify/
      metadata/
      assets/
    verify/[recordId]/
    inspector/
    audit/
  components/
  lib/
    cloudinary/
    forensic/
    verification/
    qr/
    hashing/
  types/
docs/
public/
```

Keep provider-specific code behind adapters so Cloudinary calls do not spread throughout the UI.

## Data flow

1. Client submits media and optional context.
2. Server securely coordinates Cloudinary operations.
3. Analysis output is normalized into application signals.
4. The forensic engine consumes normalized signals, not raw provider-specific objects.
5. The result becomes a versioned verification record.
6. Structured metadata is associated with the Cloudinary asset.
7. The signed artifact references the verification state.
8. QR resolves to the verification record page.

## Failure handling

- Upload failure → clear retryable error
- Analysis unavailable → record missing signal rather than inventing one
- OCR absent → mark OCR signal unavailable
- Metadata update failure → do not report a completed verification record
- Signed transformation failure → show artifact-generation error
- Invalid record ID → verification page returns a clear not-found state

## Design rule

Do not add infrastructure simply to increase technology count. The final specification explicitly prioritizes execution discipline and a small working MVP.

# Provera — Verification Model

## VerificationRecord

Conceptual shape:

```ts
type VerificationRecord = {
  recordId: string;
  asset: {
    publicId: string;
    resourceType: string;
    format?: string;
    version?: number;
  };
  score: number;
  status: "VERIFIED" | "REVIEW" | "FLAGGED";
  signals: {
    metadataAvailability: number | null;
    ocrConsistency: number | null;
    visualConsistency: number | null;
    duplicateIndicator: number | null;
    mediaQuality: number | null;
  };
  reasons: string[];
  timestamp: string;
  engineVersion: string;
  recordHash: string;
};
```

The implementation may extend this shape, but the core semantics must remain stable.

## Record ID

Use a human-readable identifier such as:

```text
PV-2026-XXXXXXXX
```

The exact generation method should avoid collisions.

## Canonical record

Before hashing, construct a canonical representation with deterministic key ordering and normalized values.

Do not hash a JSON string whose key order can vary.

## Record hash

Use Node.js `crypto` to compute an application-level SHA-256 hash of the canonical verification record.

The hash identifies the verification state represented by the record.

It does not make the original image immutable and does not prove historical authenticity.

## Signed artifact

The artifact is a dynamically transformed representation of the verification record associated with the Cloudinary asset.

It should show:

- VERIFIED / REVIEW / FLAGGED
- Forensic Consistency Score
- Record ID
- Short record hash
- QR code

Preferred language:

> Signed verification record

or:

> Tamper-evident verification artifact

Avoid language implying that the photograph itself has been proven authentic.

## QR verification

The QR code should resolve to:

```text
{NEXT_PUBLIC_APP_URL}/verify/{recordId}
```

The verification page should display:

- record ID
- asset identity
- status
- score
- timestamp
- engine version
- signal breakdown
- reasons
- record hash
- Cloudinary-related artifact information where appropriate

## Verification page principle

A user scanning the QR should be able to understand exactly what was recorded and assessed, without being told that the system proved an absolute truth about the original photograph.

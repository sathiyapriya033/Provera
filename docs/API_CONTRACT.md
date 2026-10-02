# Provera — API Contract

## General response

Success:

```json
{
  "ok": true,
  "data": {}
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

## POST `/api/analyze`

### Purpose

Accept an uploaded asset reference and optional context, run the configured analysis workflow, normalize signals and return an analysis result.

### Request

```json
{
  "publicId": "provera/example",
  "context": "Accident occurred on Main Road"
}
```

### Response

```json
{
  "ok": true,
  "data": {
    "analysisId": "..."
  }
}
```

## POST `/api/verify`

### Purpose

Create, persist and attach a deterministic verification record for an uploaded asset (Phase 4).

The server re-runs the Cloudinary analysis and the forensic engine for the supplied
`publicId`; client-supplied analysis signals or scores are **not** trusted, because a
persisted record must not be forgeable by editing request fields.

### Request

```json
{
  "publicId": "provera/example",
  "context": "Accident occurred on Main Road",
  "referenceHashes": ["c9635a63eacf11c1"]
}
```

`context` (≤ 2000 chars) and `referenceHashes` (≤ 100 sixteen-character hex perceptual hashes) are optional. `context` is compared against detected image text by the OCR/claim signal; `referenceHashes` are compared against the asset's perceptual hash.

### Response

HTTP 201:

```json
{
  "ok": true,
  "data": {
    "record": { },
    "integrityVerified": true,
    "metadataAttached": true
  }
}
```

`record` is the persisted `VerificationRecord` (see [Verification Model](VERIFICATION_MODEL.md)). `integrityVerified` reports whether the record hash was reproduced from the canonical record. `metadataAttached` is `true` only when the `provera_*` structured metadata fields were written to the Cloudinary asset.

### Errors

- `INVALID_INPUT` (400) — malformed body, `publicId`, `context` or `referenceHashes`.
- `ANALYSIS_FAILED` / `ANALYSIS_UNAVAILABLE` — the Cloudinary analysis workflow did not complete.
- `METADATA_UPDATE_FAILED` (502) — the record was rolled back because the Cloudinary metadata update failed.
- `VERIFICATION_FAILED` (500) — record build, persistence or unexpected failure.
- `INTERNAL_ERROR` (500) — Cloudinary credentials are not configured.

## GET `/api/verify/:recordId`

Returns the stored verification record and an integrity check.

```json
{
  "ok": true,
  "data": {
    "record": { },
    "integrity": { "verified": true, "computedHash": "…" }
  }
}
```

`computedHash` is recomputed from the stored record data; it should equal `record.recordHash`. An ID that does not match `PV-YYYY-XXXXXXXX` returns `INVALID_INPUT` (400); a well-formed but unknown ID returns `RECORD_NOT_FOUND` (404).


## GET `/api/artifact/:recordId`

Returns the signed Cloudinary verification artifact for a stored record (Phase 5). The artifact is generated on demand from the record and is not stored by the application.

```json
{
  "ok": true,
  "data": {
    "artifact": {
      "artifactVersion": "provera-artifact@1",
      "recordId": "PV-2026-XXXXXXXX",
      "publicId": "provera/example",
      "resourceType": "image",
      "url": "https://res.cloudinary.com/<cloud>/image/upload/s--<signature>--/…/f_auto,q_auto/v1/provera/example",
      "signed": true,
      "signature": "<signature>",
      "transformation": "b_rgb:0f172a,c_pad,h_1200,w_1200/…/f_auto,q_auto",
      "layers": [{ "purpose": "Canvas 1200x1200, letterboxed…", "parameters": "b_rgb:0f172a,c_pad,h_1200,w_1200" }],
      "canvas": { "width": 1200, "height": 1200 },
      "optimization": { "fetchFormat": "auto", "quality": "auto" },
      "verificationUrl": "http://localhost:3000/api/verify/PV-2026-XXXXXXXX"
    },
    "delivery": {
      "verified": true,
      "status": 200,
      "contentType": "image/jpeg",
      "contentLength": 149679,
      "negotiated": [{ "accept": "image/webp", "contentType": "image/webp", "contentLength": 104000 }]
    },
    "signatureNote": "Signed with the Cloudinary account API secret…"
  }
}
```

`layers` are the transformation components in delivery order, for inspection. `delivery` is the result of a `HEAD` request against the signed URL: an artifact is only reported as generated when that response is HTTP 2xx with an `image/*` content type, and `negotiated` shows what `f_auto` returns when WebP is acceptable.

### Errors

- `INVALID_INPUT` (400) — malformed record ID.
- `RECORD_NOT_FOUND` (404) — no stored record with that ID.
- `ARTIFACT_FAILED` (502) — Cloudinary delivery did not return a usable image, or the CDN could not be reached.
- `INTERNAL_ERROR` (500) — Cloudinary credentials are not configured.

### Security

`CLOUDINARY_API_SECRET` stays on the server; only the derived signed URL is returned. The signature is computed server-side and never lets the secret reach the client. Cloudinary enforces delivery signatures only for restricted assets — for these publicly delivered uploads the signature is an integrity marker for the requested transformation, not access control (verified in `docs/CLOUDINARY.md`).

## GET `/api/assets`

Optional audit-queue endpoint. It should use Cloudinary metadata/search rather than introducing an unnecessary database.

## POST `/api/metadata`

Not implemented as a public endpoint. Verification metadata is written server-side by `/api/verify` through `src/lib/verification/metadata.ts` (`uploader.update_metadata`), so the Cloudinary secret never leaves the server and a metadata failure is handled together with record rollback.

## Error codes

Suggested:

- `INVALID_INPUT`
- `UPLOAD_FAILED`
- `ANALYSIS_FAILED`
- `ANALYSIS_UNAVAILABLE`
- `VERIFICATION_FAILED`
- `METADATA_UPDATE_FAILED`
- `ARTIFACT_FAILED`
- `RECORD_NOT_FOUND`
- `UNAUTHORIZED`
- `INTERNAL_ERROR`

## Security

Cloudinary API secrets remain server-side. Do not expose `CLOUDINARY_API_SECRET` to the browser.

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

Returns or redirects to the signed Cloudinary verification artifact.

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

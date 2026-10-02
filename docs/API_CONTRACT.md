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

Returns the signed Cloudinary verification artifact for a stored record (Phase 5), including the record's verification QR code (Phase 6). The artifact is generated on demand from the record and is not stored by the application.

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
      "verificationUrl": "https://<app>/verify/PV-2026-XXXXXXXX",
      "hasQr": true
    },
    "delivery": {
      "verified": true,
      "status": 200,
      "contentType": "image/jpeg",
      "contentLength": 162282,
      "negotiated": [{ "accept": "image/webp", "contentType": "image/webp", "contentLength": 132990 }]
    },
    "qr": {
      "publicId": "provera/qr-PV-2026-XXXXXXXX",
      "url": "https://res.cloudinary.com/<cloud>/image/upload/v1/provera/qr-PV-2026-XXXXXXXX.png",
      "version": 1790937394,
      "destination": "https://<app>/verify/PV-2026-XXXXXXXX",
      "size": 328,
      "moduleCount": 33
    },
    "signatureNote": "Signed with the Cloudinary account API secret…"
  }
}
```

`layers` are the transformation components in delivery order, for inspection — ten of them with a QR, nine without. `delivery` is the result of a `HEAD` request against the signed URL: an artifact is only reported as generated when that response is HTTP 2xx with an `image/*` content type, and `negotiated` shows what `f_auto` returns when WebP is acceptable.

`qr` describes the Cloudinary-hosted QR image that is composited onto the artifact. The server generates the QR, uploads it, then builds and verifies the artifact in the same request, so the three cannot disagree. `qr` is typed `null` for inputs built without a QR public ID; the API always supplies one.

### Errors

- `INVALID_INPUT` (400) — malformed record ID.
- `RECORD_NOT_FOUND` (404) — no stored record with that ID.
- `ARTIFACT_FAILED` (502) — the QR image could not be stored, Cloudinary delivery did not return a usable image, or the CDN could not be reached.
- `INTERNAL_ERROR` (500) — Cloudinary credentials are not configured.

### Security

`CLOUDINARY_API_SECRET` stays on the server; only the derived signed URL is returned. The signature is computed server-side and never lets the secret reach the client. Cloudinary enforces delivery signatures only for restricted assets — for these publicly delivered uploads the signature is an integrity marker for the requested transformation, not access control (verified in `docs/CLOUDINARY.md`).

The QR asset is public (`type: "upload"`), like the source asset. It contains a URL and nothing else: no score, verdict, hash or credential.

## GET `/verify/:recordId`

The public HTML verification page — the destination of the artifact's QR code (Phase 6). No login, no API key, no JSON. It reads the stored record, recomputes the record hash, and renders status, score, timestamp, engine version, signal breakdown, coverage, reasons, flags, the record hash with its verification result, and the submitted claim.

| Input | Rendered state | HTTP status |
|---|---|---|
| Known record | The recorded assessment | 200 |
| ID not matching `PV-YYYY-XXXXXXXX` | "Invalid record ID" explanation | 200 |
| Well-formed but unknown ID | `not-found.tsx`, "Record not found" (`noindex`) | 200\* |

\* The route is `force-dynamic` and streamed, so `notFound()` replaces the rendered body; the status line may still be 200. The two error states are distinguished by the page content, not by the status code, and a missing record is never reported as a passed or failed verification.

## GET `/api/inspector/:recordId`

The Inspector Mode report (Phase 7) as JSON — the machine-readable twin of the `/inspector` page. Everything in it is read from Cloudinary during the request.

```json
{
  "ok": true,
  "data": {
    "inspectionVersion": "provera-inspection@1",
    "generatedAt": "2026-10-02T09:00:00.000Z",
    "record": { "recordId": "PV-2026-XXXXXXXX", "score": 75, "status": "REVIEW", "integrityVerified": true, "…": "…" },
    "asset": {
      "recorded": { "publicId": "provera/example", "version": 1790875061, "…": "…" },
      "identity": {
        "outcome": "consistent",
        "mismatched": [],
        "notes": [],
        "checks": [{ "field": "version", "recorded": "1790875061", "live": "1790875061", "state": "match" }]
      },
      "live": {
        "available": true,
        "fields": { "assetId": "043a…", "phash": "c9635a63eacf11c1", "accessMode": null, "…": "…" }
      }
    },
    "metadata": {
      "fields": [{ "field": "provera_score", "expected": 75, "live": "75", "state": "match" }],
      "extraLiveFields": [],
      "matchCount": 7, "mismatchCount": 0, "missingCount": 0, "matches": true
    },
    "qr": { "asset": { "publicId": "provera/qr-PV-2026-XXXXXXXX", "…": "…" }, "failure": null, "live": { "available": true, "bytes": 940 } },
    "artifact": { "status": "verified", "artifact": { "url": "https://…", "layers": [], "…": "…" }, "delivery": { "verified": true, "status": 200 } },
    "derivatives": { "matching": 10, "total": 10, "entries": [], "truncated": false },
    "scope": "The live Cloudinary state in this report was read now…"
  }
}
```

Enumerated states, so a client never has to guess what a value means:

- `asset.identity.outcome` — `consistent` | `changed` | `unknown` (`unknown` when the live read failed, so nothing is compared).
- `asset.identity.checks[].state` — `match` | `mismatch` | `not_compared`.
- `metadata.fields[].state` — `match` | `mismatch` | `missing`.
- `asset.live` / `qr.live` — `available: false` carries the reason instead of values.
- `artifact.status` — `verified` (with `delivery`) | `unavailable` (with `reason`).
- `qr.failure` — non-null when the QR asset could not be produced.

Comparison is by string form, so a numeric field matches whether the API returns `75` or `"75"`. A section that failed is reported as unavailable with its reason and the rest of the report still returns `200`; only a missing record or missing credentials fail the request. The response never contains `CLOUDINARY_API_SECRET`.

### Errors

- `INVALID_INPUT` (400) — malformed record ID.
- `RECORD_NOT_FOUND` (404) — no stored record with that ID.
- `INTERNAL_ERROR` (500) — Cloudinary credentials are not configured, or an unexpected server error.


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

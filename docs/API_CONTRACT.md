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

Create a deterministic verification result from normalized analysis signals and context.

### Request

```json
{
  "asset": {
    "publicId": "provera/example"
  },
  "context": "Accident occurred on Main Road",
  "signals": {
    "metadataAvailability": 100,
    "ocrConsistency": 80,
    "visualConsistency": 90,
    "duplicateIndicator": 100,
    "mediaQuality": 90
  }
}
```

### Response

Returns the `VerificationRecord`.

## GET `/api/verify/:recordId`

Returns the verification record for a valid record ID.

Invalid or unknown IDs return a clear not-found error.

## GET `/api/artifact/:recordId`

Returns or redirects to the signed Cloudinary verification artifact.

## GET `/api/assets`

Optional audit-queue endpoint. It should use Cloudinary metadata/search rather than introducing an unnecessary database.

## POST `/api/metadata`

Internal/server-side operation for writing verification metadata to the Cloudinary asset.

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

# Provera — Cloudinary Integration

## Principle

Cloudinary must be an active part of the product, not a storage-only layer.

## Required roles

| Capability | Provera use |
|---|---|
| Upload API / Upload Widget | Receive field media |
| AI/media analysis | Obtain supported signals |
| AI Vision / OCR | Extract visual context/text where applicable |
| Structured Metadata | Store verification state |
| Search | Audit queue retrieval |
| Dynamic Transformations | Render verification artifact |
| Signed delivery URLs | Protect generated artifact delivery |
| `f_auto` / `q_auto` | Demonstrate optimized delivery |
| CDN | Deliver final artifact |

## Environment variables

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Only public configuration belongs in client-side code.

## Metadata model

Recommended fields:

- `provera_status`
- `provera_score`
- `provera_record_id`
- `provera_record_hash`
- `provera_timestamp`
- `provera_version`
- `provera_flags`

Use the exact Cloudinary structured metadata field configuration available in the project account. Do not pretend fields exist until they are configured.

## Analysis normalization

Create an internal normalized type such as:

```ts
type AnalysisSignals = {
  metadataAvailability: number | null;
  ocrConsistency: number | null;
  visualConsistency: number | null;
  duplicateIndicator: number | null;
  mediaQuality: number | null;
  rawSummary?: unknown;
};
```

Provider-specific response shapes should be converted into this type at the Cloudinary adapter boundary.

## Transformations

The verification artifact should visibly contain:

- status
- score
- verification record ID
- short record hash
- QR code

Use automatic format and quality optimization where appropriate.

## Signed delivery

Use Cloudinary signed delivery for the generated transformation. The signature protects the requested transformation URL from unauthorized modification.

It does not prove that the underlying photograph is historically genuine.

## Inspector Mode

Inspector Mode should expose:

- Cloudinary public ID
- upload result
- analysis summary
- structured metadata payload
- transformation parameters
- signed delivery URL
- `f_auto` / `q_auto`
- verification record ID

## Cloudinary adapter rule

Keep Cloudinary-specific implementation under:

```text
src/lib/cloudinary/
```

The forensic engine should receive normalized signals and should not depend directly on Cloudinary SDK response objects.

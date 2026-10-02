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

## Artifact transformation (Phases 5–6 — implemented)

`src/lib/cloudinary/artifact.ts` builds a dynamic transformation of the verified
asset per request; nothing is stored by Provera — Cloudinary generates and caches
the derived image. The layout is fixed (artifact version `provera-artifact@1`), so
the same record always produces the same URL and therefore the same signature.

Ten transformation components are chained in this order:

1. `w_1200,h_1200,c_pad,b_rgb:0f172a` — fixed dark canvas with the source
   letterboxed, so the layout never depends on the photo's aspect ratio.
2–8. Text layers (`l_text:Arial_…`) carrying branding, the claim boundary, the
   artifact version, status + score, record ID + **short** record hash, engine
   version + timestamp, and the verification destination. North-anchored layers
   hang from the top of the canvas and south-anchored layers from the bottom;
   each layer also carries `b_rgb:0f172a` so text stays legible whatever the
   photograph's brightness.
9. `l_provera:qr-<recordId>,w_260,h_260,c_fit,g_south_west,x_40,y_40` — the
   verification QR, bottom-left of the canvas. The overlay's public ID contains no
   slashes after `provera/`, so the layer stays a single URL path segment; a
   slashed public ID here would be escaped and break the transformation. Verified
   against this account: the `south_west` gravity with explicit `x`/`y` offsets
   places the code at the bottom-left corner regardless of source aspect ratio.
10. `f_auto,q_auto` — automatic format and quality.

The artifact contains what a record holds: status, Forensic Consistency Score,
record ID, short hash, engine version, timestamp, the verification destination and
the QR code to the verification page. The full record hash is deliberately never
printed on the artifact, so a truncated hash cannot be mistaken for it.

## QR code as a Cloudinary asset (Phase 6 — implemented)

The QR is generated in application code (`src/lib/qr/qr.ts`, no image dependency,
deterministic 8-bit grayscale PNG) and uploaded as an image asset by
`src/lib/cloudinary/qr.ts`:

| Property | Value |
|---|---|
| Public ID | `provera/qr-<recordId>` (deterministic, `overwrite: true`) |
| Resource type / delivery | `image` / `upload` (public) |
| Tags | `provera`, `verification-qr` |
| Context | `record_id=<recordId>\|destination=<url>` |
| Overlay | `l_provera:qr-<recordId>,w_260,h_260,c_fit,g_south_west,x_40,y_40` |

Measured for the reference record: 328×328 px PNG, 33×33 modules, 4-module quiet
zone; the delivered artifact containing the overlay is 162 282 B as JPEG and
132 990 B as WebP. Decoding the QR back out of the *delivered* artifact with an
independent decoder (jsQR) returns exactly `{appUrl}/verify/{recordId}`.

A Cloudinary-hosted layer is required, not a stylistic choice: Cloudinary fetches
overlay images while rendering, so a QR served only by a laptop cannot be
composited. Because the public ID is derived from the record ID, re-running the
request replaces the same asset instead of accumulating copies, and the artifact
URL — and therefore its delivery signature — stays stable for a record.

Upload errors are not swallowed: `ensureQrAsset()` raises `QrAssetError` with the
API secret redacted, and `GET /api/artifact/:recordId` reports it as
`ARTIFACT_FAILED`. A QR that failed to store is never shown as a working code, and
an artifact is never reported as generated unless the delivery probe confirmed it
renders.

## Signed delivery — what was actually verified

The artifact URL is generated with the Cloudinary SDK using `sign_url: true`, so
the signature is computed from the account API secret, which never leaves the
server. The following was measured against this account before implementation and
is re-checkable at any time by requesting the same URL with a modified signature or
a modified transformation:

| Request | Observed result |
|---|---|
| Signed artifact URL | HTTP 200, `image/jpeg`, ~150 kB |
| Same URL with `Accept: image/webp` | HTTP 200, `image/webp` (this is `f_auto` working) |
| Same URL with the `s--…--` signature removed | HTTP 200 |
| Same URL with a bogus signature (`s--AAAAAAAA--`) | HTTP 200 |
| Same URL with overlay text edited, signature unchanged | HTTP 200, different pixels |

Stated plainly, because the plan forbids pretending:

* The signature authenticates the **requested transformation**: it is derived from
  the API secret over the transformation string, so an edited transformation no
  longer matches the signature it carries.
* Cloudinary only **rejects** unsigned or tampered delivery URLs for *restricted*
  assets. This project uploads with the default public delivery, so Cloudinary
  serves the same transformation with or without a valid signature. The signature
  is therefore an integrity marker for the delivered transformation here, not an
  access-control mechanism.
* Nothing about the signature says the photograph is authentic, and the artifact
  is not immutable.

Enforcing delivery signatures would require a different delivery model for the
source asset (`type: "authenticated"` or delivery tokens). That changes how the
uploaded media is served, so it is deliberately not part of this phase; the
limitation is stated here, in `docs/VERIFICATION_MODEL.md` and in the UI.

Application behaviour: `GET /api/artifact/:recordId` builds the URL and then
issues a `HEAD` request against it. Only an HTTP 2xx `image/*` response is
reported as a generated artifact; anything else returns `ARTIFACT_FAILED` and no
artifact is shown.

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

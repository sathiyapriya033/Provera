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

## Search API — what this account actually supports (measured)

The audit queue is built on Cloudinary's Search API, so the capabilities were
measured against this account before anything was written. Every expression below
was executed; the results are what the queue is designed around.

| Expression | Result |
|---|---|
| `resource_type:image` | OK — `total_count`, `resources[]`, `next_cursor` |
| `resource_type:image AND public_id:provera/…` | OK, exact match |
| `resource_type:image AND created_at>2026-01-01` | OK — date ranges work |
| `resource_type:image AND tags=provera` | OK |
| `resource_type:image AND metadata_provera_status:REVIEW` | **400 "Field 'metadata_provera_status' not supported"** |
| `… AND metadata_provera_status:"REVIEW"` | same 400 |
| `… AND metadata_provera_status=REVIEW` | same 400 |
| `… AND provera_status:REVIEW` (no prefix) | 400 "Field 'provera_status' not supported" |
| `… AND metadata_provera_score>70` | **400 "Field 'metadata_provera_score' not supported"** |
| `… AND metadata_provera_score:75` | same 400 |
| `sort_by("provera_score", "desc")` | **400 "Invalid search field: provera_score"** |
| `aggregate("total_count")` | **400 "Your subscription plan does not support aggregations"** |

This is a real constraint, not a syntax mistake. The field definitions themselves
report `"restrictions": { "excluded_from_search": false }`, so the fields are not
excluded — the account's Search API simply does not index structured metadata.
Three different expression syntaxes were tried, with and without the
`metadata_` prefix and with and without quoting, and all were rejected at field
resolution.

What does work, and is what the queue uses:

```ts
cloudinary.search
  .expression("resource_type:image")
  .sort_by("created_at", "desc" | "asc")
  .max_results(pageSize)
  .with_field("metadata")
  .next_cursor(cursor)   // when paging
  .execute();
```

`with_field("metadata")` attaches the full `provera_*` map to each result, which is
what makes metadata-backed retrieval possible at all. Retrieval, `created_at`
ordering and pagination are all Cloudinary-side; the status and score filters run
in Provera over that metadata, and `docs/API_CONTRACT.md` records that split in the
`filterAuthority` and `sortAuthority` fields of the response.

## Audit queue (Phase 8 — implemented)

`/audit` is the searchable list of verifications. **There is no queue database.**
Every row is a Cloudinary asset whose `provera_*` structured metadata is read back
during the request, so the metadata mirror from Phase 4 doubles as the index. If
an asset is deleted from the account, its row disappears from the queue — which is
the intended behaviour for an audit view over a media account, and the reason the
page says a row exists only while the asset does.

The endpoint is `GET /api/assets`, matching the contract. Parameters: `status`,
`minScore`, `maxScore`, `sort`, `limit`, `cursor`.

* **Status filter** — exact match against `provera_status`.
* **Score filter** — an inclusive `minScore`/`maxScore` range against
  `provera_score`.
* **Recent records** — the default listing is Cloudinary's `created_at desc`, so the
  queue opens on the newest uploads.
* **Non-record assets are excluded and counted.** The account also holds uploaded
  images and QR assets that carry no `provera_record_id`; they are not queue rows,
  and the result reports how many were skipped rather than quietly dropping them.

Honest behaviour worth stating:

* A record whose `provera_score` is missing cannot satisfy a score filter. It is
  not treated as `0`, which would silently invent a "0% score" result.
* A record with no score sorts **last** in both score directions. An unknown score
  is never presented as the best or the worst result.
* A `provera_record_id` that does not match `PV-YYYY-XXXXXXXX` means the asset is
  reported as not-a-record, so a tampered metadata value cannot become a working
  link in the queue.
* Because filtering happens after retrieval, **a page can contain no matching rows
  while a later page contains some.** This was observed live: with `limit=2`, page
  one matched 0 of 2 and page two matched 1 of 2. The response therefore reports
  `pageExhaustedWithoutMatch`, and the page offers a next page instead of claiming
  there is nothing to find.
* Unusable filter values are returned in `rejected` with a reason and the request
  still succeeds with the remaining filters applied, so a mistyped filter is
  visible rather than silently ignored.
* The queue reports a row as recorded in Cloudinary. Whether that row still agrees
  with the stored record is a separate question, answered by Inspector Mode.

A known scaling limit: since the metadata filters run after retrieval, the queue
scans a bounded page (default 25, maximum 100) of the account's images. Tagging
verified assets at verification time would allow a server-side `tags=` filter and
remove the scan; that is deliberately left out of this phase, because it would
change the Phase 4 write path and every record written before it.

## Inspector Mode (Phase 7 — implemented)

`/inspector?recordId=<id>` shows the live Cloudinary state of a verified asset next
to the record that describes it, so the integration can be checked without trusting
the application's own summary. The data is read on every request through
`collectInspection()`; the report is assembled by the pure
`buildInspectionReport()` in `src/lib/inspection/inspect.ts`. The same report is
available as JSON at `GET /api/inspector/:recordId`.

Sections, each corresponding to a field read from this account rather than assumed:

1. **Asset identity: record vs live** — `public_id`, `resource_type`, `format`,
   `version` and `secure_url` as captured at verification time, against what
   Cloudinary returns now. A `version` difference means the file at that public ID
   was replaced after verification; the report says so explicitly rather than
   showing a quiet mismatch. Fields the record never stored are marked
   `not_compared`, never counted as agreement.
2. **Live Cloudinary asset** — `asset_id`, dimensions, `bytes`, `created_at`,
   `last_updated`, `secure_url`, perceptual hash (`phash`), EXIF field count,
   image metadata keys, tags, context, predominant colours and the Admin API
   rate-limit counters.
3. **Structured metadata** — the seven `provera_*` fields, each compared with the
   value the record implies and labelled `match`, `mismatch` or `missing`.
4. **Recorded analysis signals** — the normalized signal values stored in the
   record, with `coverage` and the analysis ID. A `null` signal is shown as
   *unavailable*, never as a zero.
5. **Artifact transformation** — the rendered artifact, the signed delivery URL,
   the signature, all ten transformation components with their parameters, and the
   `f_auto` / `q_auto` optimization pair with the measured delivery response.
6. **Verification QR** — the overlay source asset, its public ID, module count,
   destination and its live Cloudinary state.
7. **Derivatives Cloudinary generated** — cached derived images whose
   transformation carries this record's ID in a text layer, with Cloudinary's own
   `transformation_signature`. This is the account's own record that the
   transformation really executed; it is not something Provera asserts.

### Admin API call used

```ts
cloudinary.api.resource(publicId, {
  resource_type: "image",
  type: "upload",
  metadata: true,
  context: true,
  tags: true,
  colors: true,
  exif: true,
  phash: true,
});
```

Measured against this account (the fields the report depends on):

| Field | Observed |
|---|---|
| `metadata` | all seven `provera_*` values, with `provera_score` as a **number** |
| `context` | `{ custom: { … } }`; `undefined` when the asset has no context |
| `tags` | array of strings; `undefined` when the asset has no tags |
| `phash` | present (`c9635a63eacf11c1` for the reference asset) |
| `predominant.google` | `[[name, percent], …]` |
| `derived[]` | `transformation`, `transformation_signature`, `format`, `bytes`, `secure_url` |
| `last_updated` | `{ updated_at, metadata_updated_at }` |
| `access_mode` | **not reported** by this endpoint, even with `access_mode: true` |
| `rate_limit_allowed` / `rate_limit_remaining` | 500 / 499 on a read |
| missing asset | rejects with `{ error: { message, http_code: 404 } }` |

`access_mode` is not reported for this account, so the UI prints "not reported by
this API" rather than asserting the asset is public. `tags` and `context` are
genuinely absent on the uploaded source asset; the report shows "none set" instead
of an empty table, and the QR asset — which does carry both — proves the read works.

Metadata comparison is by string form, so `provera_score: 75` matches whether
Cloudinary returns `75` or `"75"`. This was verified live by writing `99` to
`provera_score` on the asset: the report immediately showed `mismatch` for that
field and `matches: false`, and returned to a clean 7/7 after the original value
was written back.

Two states cannot be produced through the SDK on this account and are therefore
covered by unit tests rather than by a live check: writing a `provera_*` field that
does not exist is rejected with `The following metadata fields do not exist`, and
clearing a field with a `null` value is rejected by `uploader.update_metadata`. A
structured field can only be unset in the Media Library, which is exactly the case
the `missing` state exists for.

Honest limits of the view:

* The live read is a snapshot taken now. It is **not** the analysis that produced
  the record — `analysisId` is an application-generated UUID, so the original
  analysis cannot be re-read from Cloudinary, and re-running the analysis would
  produce a different result at a different time. The report says this in its
  `scope` field and the page prints it above the sections.
* A matching metadata set means the asset still carries the record's summary. It
  is not proof that the photograph is authentic, and it does not detect a
  replacement made *and* the metadata rewritten to match.
* Every section degrades on its own: an unreadable asset, a failed QR upload or a
  failed artifact delivery is reported as unavailable with its reason, and the
  rest of the report still renders. Nothing is fabricated to fill a gap.

## Cloudinary adapter rule

Keep Cloudinary-specific implementation under:

```text
src/lib/cloudinary/
```

The forensic engine should receive normalized signals and should not depend directly on Cloudinary SDK response objects.

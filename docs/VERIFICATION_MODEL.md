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
## Implemented record (Phase 4)

Implemented in `src/lib/verification/record.ts` under schema version
`provera-record@1` (`RECORD_SCHEMA_VERSION`). The persisted shape extends the
conceptual shape above:

```ts
type VerificationRecord = {
  recordId: string;              // PV-YYYY-XXXXXXXX
  schemaVersion: string;         // "provera-record@1"
  asset: {
    publicId: string;
    resourceType: string;
    format?: string;             // omitted when unknown, never invented
    version?: number;
    secureUrl?: string;
  };
  score: number;                 // 0–100
  status: "VERIFIED" | "REVIEW" | "FLAGGED";
  signals: {
    metadataAvailability: number | null;
    ocrConsistency: number | null;
    visualConsistency: number | null;
    duplicateIndicator: number | null;
    mediaQuality: number | null;
  };
  reasons: string[];             // prefixed "Positive: ", "Concern: ", "Note: "
  flags: string[];               // "unavailable:<component>", "concern:<component>"
  coverage: number;              // scoreable weight out of 100 (Phase 3 semantics)
  context: string | null;        // submitted claim, when one was supplied
  analysisId: string | null;     // analysis operation this record was built from
  timestamp: string;             // ISO-8601 UTC creation time
  engineVersion: string;         // "provera-forensic@1"
  recordHash: string;            // SHA-256 hex of the canonical record
};
```

Documented extensions and their rationale:

* `schemaVersion`, `coverage`, `context`, `analysisId`, `flags` and the optional
  asset fields make the record self-describing without a second lookup.
* The five `signals.*` slots reuse the Phase 3 component keys
  (`metadata`, `ocrClaim`, `visualContent`, `duplicate`, `mediaQuality`).
  Components excluded from scoring are stored as `null` — unavailable data is
  never imputed into a favorable number.
* `reasons` keep their kind as a text prefix so the "why" survives storage; the
  `flags` array is the machine-readable equivalent.

## Record ID (implemented)

`createRecordId()` produces `PV-YYYY-XXXXXXXX`:

* `YYYY` is the UTC year at creation time.
* `XXXXXXXX` is 8 characters drawn from a 32-character alphabet with `I`, `O`,
  `0` and `1` removed (`A–Z` minus `I`/`O`, plus `2–9`) — 40 bits of entropy from
  5 random bytes.

Uniqueness is enforced by `allocateRecordId()` in `src/lib/verification/store.ts`:
it re-generates the ID while the store already contains it and fails the request
rather than overwriting an existing record. The ID is validated everywhere with
`RECORD_ID_PATTERN` before it touches the filesystem, so no caller-supplied
string can escape the record directory.

## Canonical record and hash (implemented)

Exact procedure, so it can be reproduced independently:

1. Take the record and remove the `recordHash` field.
2. Recursively sort object keys lexicographically. Array order is preserved —
   `reasons` and `flags` are ordered data.
3. Compute `JSON.stringify(...)` of the sorted structure (no whitespace).
4. `recordHash = SHA-256 hex of that UTF-8 string`.

`computeRecordHash()` performs steps 1–4; `canonicalizeRecord()` returns the
sorted structure itself, which is what the implementation hashes — a JSON string
with variable key order is never hashed. `verifyRecordIntegrity()` recomputes the
hash and compares it with `timingSafeEqual`.

Determinism, key-order independence and tamper detection are covered by
`src/lib/verification/record.test.ts` (run with `npm test`).

Limitation (restated because it matters): the hash is application-level tamper
evidence for this record. It does not make the original image immutable, does not
prove historical authenticity, and anyone holding write access to the store can
replace record and hash together.

## Persistence (implemented)

Selected approach: one JSON file per record under
`<cwd>/data/records/<recordId>.json`. No database, no external service and no new
environment variables — the acceptance criteria require retrieval by ID, not
query or scale.

Implementation in `src/lib/verification/store.ts`:

* `saveRecord()` creates the directory when needed and writes atomically (temp
  file + `rename`), so a crash cannot leave a half-written record under the
  final name.
* `getRecord()` reads a record by ID; an unknown or malformed ID raises
  `RECORD_NOT_FOUND`.
* `deleteRecord()` exists only for rollback (see the metadata section below).
* `data/` is git-ignored; records are never committed.

Honest limitations:

* Records live on the local filesystem of the process that served the request.
  They survive server restarts, but not container/host rebuilds, redeploys or
  moves.
* Single-instance only: no replication and no cross-instance locking, so two
  running instances do not share records.
* The store is not tamper-proof and has no access control beyond file
  permissions; `recordHash` makes edits detectable, not impossible.
* No audit queue, no search and no retention policy.

## Cloudinary structured metadata (implemented)

Seven account-level structured-metadata fields were created through the Admin API
(`api.add_metadata_field`); no manual dashboard step is required, and re-running
creation is idempotent:

| Field | Type | Stored value |
| --- | --- | --- |
| `provera_status` | string | `VERIFIED` / `REVIEW` / `FLAGGED` |
| `provera_score` | integer | record score (0–100) |
| `provera_record_id` | string | `PV-YYYY-XXXXXXXX` |
| `provera_record_hash` | string | full SHA-256 record hash |
| `provera_timestamp` | string | ISO-8601 record timestamp |
| `provera_version` | string | engine version (`provera-forensic@1`) |
| `provera_flags` | string | comma-separated flags (empty string when none) |

`src/lib/verification/metadata.ts` writes them with
`uploader.update_metadata(values, [publicId])` — one Upload API call per record,
keyed by the asset `publicId`, with no separate asset-ID resolution step.

Failure behaviour: a failed update raises `MetadataAttachError` and
`POST /api/verify` answers `METADATA_UPDATE_FAILED`. The persisted record is
rolled back first, so a stored record never exists without its asset metadata.
Cloudinary errors pass through the shared `describeCloudinaryError` helper and
the API secret is redacted before anything is thrown or logged.

## Endpoints (implemented)

`POST /api/verify`

```json
{
  "publicId": "provera/example",
  "context": "Accident on Main Road",
  "referenceHashes": ["c9635a63eacf11c1"]
}
```

`context` and `referenceHashes` are optional; `referenceHashes` feed the Phase 3
duplicate comparison. The server re-runs the Cloudinary analysis for `publicId`,
re-runs the forensic engine, builds the record, persists it and attaches the
metadata. Response (HTTP 201):

```json
{
  "ok": true,
  "data": { "record": {}, "integrityVerified": true, "metadataAttached": true }
}
```

* The record is always derived from server-observed analysis data. A
  client-supplied analysis or score is never trusted, because a persisted record
  must not be forgeable by editing request fields.
* Errors: `INVALID_INPUT` (400), `ANALYSIS_FAILED` / `ANALYSIS_UNAVAILABLE`
  (provider status), `METADATA_UPDATE_FAILED` (502), `VERIFICATION_FAILED` (500).

`GET /api/verify/:recordId`

Returns `{ "ok": true, "data": { "record": {}, "integrity": { "verified": true, "computedHash": "…" } } }`,
where `computedHash` is recomputed from the stored record. An invalid ID is
`INVALID_INPUT` (400); an unknown record is `RECORD_NOT_FOUND` (404).

## Record UI (implemented)

`src/components/verification/record-panel.tsx` is rendered by the score panel
once a score exists. It requests `POST /api/verify` for the analysed asset and
displays the stored record: status, score, record ID, asset identity, timestamp,
engine and schema versions, coverage, signal breakdown, flags, the full record
hash with the integrity-check result, the recorded reasons, and a link to
`/api/verify/<recordId>` for the raw JSON.

Honest UI language only: the panel states that the hash detects later edits to
the record, that it does not make the original image immutable, and that it does
not prove authenticity.

## Signed artifact (Phase 5 — implemented)

The artifact is a **Cloudinary dynamic transformation of the verified asset**,
built from the stored record by `src/lib/cloudinary/artifact.ts` (artifact
version `provera-artifact@1`). Provera stores nothing for the artifact: the URL is
generated per request, Cloudinary renders and caches the derived image on first
request, and the application verifies with a `HEAD` request that an image really
came back before reporting success.

It shows status, Forensic Consistency Score, record ID, **short** record hash,
engine version, record timestamp, Provera branding, the artifact version, and the
verification destination. The short hash is the first 16 characters of
`recordHash`; the full hash stays in the record so that a printed artifact can
never be mistaken for a complete integrity check. Phase 6 adds the QR code as one
more layer — see the next section.

Determinism: the layout is fixed, so the same record always produces the same
transformation, the same URL and the same signature.

Failure handling: a missing record returns `RECORD_NOT_FOUND`, a non-image or
failing delivery returns `ARTIFACT_FAILED`, and the UI shows an artifact error
instead of an artifact. A successful artifact is never fabricated.

Honest limitations (measured, see the evidence table in `docs/CLOUDINARY.md`):

* The delivery URL is signed with the account API secret, which stays on the
  server. Any change to the transformation invalidates that signature.
* Cloudinary enforces delivery signatures only for restricted assets. This
  project's assets use the default public delivery, so the same transformation is
  also served unsigned — the signature is an integrity marker for the delivered
  transformation, not access control.
* The artifact is regenerated from the record on request. It is not an immutable
  archival copy, and it does not prove the photograph is authentic.

## QR verification (Phase 6 — implemented)

The QR code resolves to:

```text
{NEXT_PUBLIC_APP_URL}/verify/{recordId}
```

`verificationPageUrl()` in `src/lib/qr/qr.ts` is the single definition of that
destination; the printed artifact layer, the QR payload, the UI link and the tests
all use it, so the artifact and the page can never disagree.

The code is generated by `encodeQrPng()` (error correction `M`, 8 px per module, the
specification's 4-module quiet zone) and encoded as an 8-bit grayscale PNG written
by hand, with no image dependency. The encoding is deterministic: the same
destination always yields byte-identical PNG output, so a record's artifact URL —
and therefore its delivery signature — stays stable.

Correctness is not assumed. `src/lib/qr/qr.test.ts` decodes the generated PNG with
an independent decoder (jsQR) and asserts it resolves to the exact destination URL,
so a wrong or mis-encoded QR fails the test suite rather than shipping.

### Why the QR lives in Cloudinary

The artifact composites the QR with an `l_provera:qr-<recordId>` overlay, so the
image has to be fetchable by Cloudinary while it renders — an application endpoint
that is only reachable from the machine that printed the artifact cannot be
composited. `src/lib/cloudinary/qr.ts` therefore uploads the PNG as an image asset
with the deterministic public ID `provera/qr-<recordId>`, using `overwrite: true`
so repeated requests replace the same asset instead of accumulating copies. It is
tagged `provera,verification-qr` and carries `context` with the record ID and the
destination, so a Cloudinary search can list every issued QR image.

Failure to store the QR is not silent: it raises `QrAssetError`, which the artifact
endpoint reports as `ARTIFACT_FAILED`. An artifact is never rendered without the QR
it claims to carry, and a stored QR is never presented as a successful artifact
unless the artifact itself was verified to render.

### The public verification page

`src/app/verify/[recordId]/page.tsx` is the destination. It needs no login and no
credentials; it reads the same stored record the application wrote and recomputes
the integrity hash so a reader can see whether the record still matches itself. It
shows record ID, asset identity, status, Forensic Consistency Score, timestamp,
engine version, record schema, analysis ID, the signal-by-signal breakdown with
component weights and the underlying measurement, coverage, recorded reasons,
flags, the full record hash with its recomputation result, the submitted claim, and
links to the raw JSON and to the artifact.

The route is `force-dynamic` with a `loading.tsx` skeleton: records live in the
local store and change while the server runs, so the page is never prerendered or
cached.

Three states are distinguished, and none of them is a pass or a fail:

* **Invalid record ID** — the value does not match `PV-YYYY-XXXXXXXX`.
* **Record not found** (`not-found.tsx`, `noindex`) — a well-formed ID that this
  server does not hold, e.g. a record from another deployment or from before a
  redeploy. The page says so and infers nothing: an unknown record is never
  reported as a passed or a failed verification. Because the route is dynamic and
  streamed, `notFound()` can only replace the rendered body, so the response may
  still arrive with HTTP 200; the state itself is unambiguous.
* **Record found** — the recorded assessment, with the claim boundary stated in
  the page's own wording.

### What the QR does and does not do

* It points at a URL. Anyone scanning it lands on a page describing what Provera
  recorded and assessed for that asset at that moment.
* It encodes **no** score, verdict or hash of its own: the page is the only source
  of those values, so a replaced page cannot be contradicted by the printed code.
* It works only for the application URL configured on this deployment. If the
  deployment moves, previously printed artifacts point at the old host. The UI says
  this next to the code.
* It does not prove the photograph is authentic, and the printed artifact remains
  regenerable, not immutable.

## Verification page principle

A user scanning the QR should be able to understand exactly what was recorded and
assessed, without being told that the system proved an absolute truth about the
original photograph.

## Inspector Mode (Phase 7 — implemented)

The mirror image of the verification page. The verification page answers "what did
Provera record?"; Inspector Mode answers "does the Cloudinary account still agree
with that record?".

`/inspector?recordId=<id>` re-reads the asset through the Admin API and compares
it with the stored record, field by field:

* **Asset identity** — `public_id`, `resource_type`, `format`, `version` and
  `secure_url`, as captured at verification time against live values. A `version`
  difference means the file at that public ID was replaced after verification.
* **Structured metadata** — the seven `provera_*` fields written in Phase 4 against
  the values the account holds now, each labelled `match`, `mismatch` or `missing`.

This is the one place where drift between the record and the account is visible,
and it matters for the record's own claims: the metadata mirror is only meaningful
if something checks it. Provera reports a mismatch and never repairs it, because a
silent repair would destroy the evidence of the change.

The report deliberately does **not** re-run the analysis and present it as the
original. `analysisId` is an application-generated UUID, not a Cloudinary analysis
identifier, so the analysis behind a record cannot be retrieved after the fact;
re-running it would produce a different result at a different time. The report
carries a `scope` field stating this, and the page prints it above the sections.

Report assembly (`src/lib/inspection/inspect.ts`) is pure and independently unit
tested; the Cloudinary calls live in `src/lib/inspection/collect.ts`. Measured
Admin API behaviour and the full list of limits: [Cloudinary Integration](CLOUDINARY.md).

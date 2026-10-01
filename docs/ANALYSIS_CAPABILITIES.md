# Provera — Cloudinary Analysis Capabilities (Verified)

This document records which Cloudinary analysis capabilities were **verified
against the configured project account** while implementing Phase 2, which are
unavailable, and how each maps to Provera's signal model.

Last verified: 2026-10-01, cloud `plugwysy` (verification performed with live
API calls; no credentials are recorded here).

## Selected workflow

Provera's Phase 2 workflow (`cloudinary-asset-analysis@1`) is:

1. **Admin API — `resource`** with `exif`, `image_metadata`, `colors`,
   `faces`, `phash` → metadata, visual palette/face, and fingerprint signals.
2. **Upload API — `explicit`** with `quality_analysis` and `ocr=adv_ocr`
   → media-quality score and OCR output (when the OCR add-on is enabled).
3. **Analyze API (Beta) — `google_tagging`** with the asset ID
   → AI content tags (when the account has an active subscription).

All three calls run server-side. Their results are normalized in
`src/lib/cloudinary/analysis.ts` into `NormalizedAnalysis`
(`src/types/index.ts`); unavailable capabilities are returned with an explicit
`unavailable` status and the server-provided reason.

## Verified as available (real data returned)

| Capability | API call | Verified response |
| --- | --- | --- |
| Image metadata (JFIF/EXIF/IPTC/XMP) | `resource` / `explicit` with `image_metadata: true` | `image_metadata` object with real fields |
| EXIF block | `resource` with `exif: true` | `exif` object (empty when the source image carries no EXIF) |
| Perceptual hash (pHash) | `resource` / `explicit` with `phash: true` | `phash: "c9635a63eacf11c1"` |
| Quality analysis | `explicit` with `quality_analysis: true` | `quality_analysis: { focus: 0.5076… }` |
| Color palette | `resource` / `explicit` with `colors: true` | `colors` array and `predominant` (cloudinary + google palettes) |
| Face detection | `resource` with `faces: true` | `faces` array |
| Illustration score | returned with the resource | `illustration_score: 0` |
| Structural asset info | `resource` | dimensions, bytes, format, `etag`, `created_at`, `original_filename` |

## Verified as unavailable on this account

Paid add-ons are **not subscribed**. Each result below came from a live call:

| Capability | Call attempted | Server response | Effect in Provera |
| --- | --- | --- | --- |
| Google auto tagging | Analyze API `POST /analyze/google_tagging` | `HTTP 403` — `account does not have an active subscription for feature` (`feature_name: google_tagging`) | `visual.contentTags = null` with the exact reason recorded |
| Cloudinary AI Vision | Analyze API `ai_vision_general`, `ai_vision_tagging` | `HTTP 403` (`feature_name: ai_vision`) | Not used by the workflow |
| AI Content Analysis (captioning, image quality, watermark, etc.) | Analyze API `captioning`, `image_quality`, `watermark_detection`, `shop_classifier`, `lvis` | `HTTP 403` (`feature_name: object_detection`) | Not used by the workflow |
| OCR (Google, add-on) | Upload API `explicit` with `ocr: "adv_ocr"` | Call succeeds but returns **no `ocr` node** (parameter silently ignored without the add-on) | `ocr.status = "unavailable"` with an explicit reason |
| YOLO object detection | `explicit` with `detection: "yolo"` | No detection data returned | Not used by the workflow |

Notes:

- The Upload API silently ignores add-on parameters when the add-on is not
  enabled, so the adapter treats a missing `ocr` node as *unavailable* — it
  never fabricates OCR text.
- The Analyze API returns a definitive `403` with the feature name, which is
  what Provera reports verbatim in the `limitations` list.

## Signal mapping

| Provera signal (Phase 2 key) | Source | Status on this account |
| --- | --- | --- |
| Metadata availability (`metadata`) | Admin API `resource` (`image_metadata`, `exif`, timestamps) | obtained |
| OCR / text (`ocr`) | Upload API `explicit` (`ocr=adv_ocr`) | unavailable (add-on not enabled) |
| Visual / content (`visual`) | Admin API `resource` (`colors`, `predominant`, `faces`, `illustration_score`) + Analyze API tags | obtained; AI content tags unavailable |
| Duplicate / fingerprint (`fingerprint`) | Admin API `resource` (`phash`) | obtained |
| Media quality (`mediaQuality`) | Upload API `explicit` (`quality_analysis`) | obtained |

The Phase 2 result records which signals were actually obtained
(`obtainedSignals`) and every observed limitation (`limitations`), so the
forensic engine can apply its documented missing-data rule instead of
inventing values.

## Re-verifying capabilities

To confirm this matrix is still accurate (for example after enabling an
add-on), run the same calls again:

1. `POST https://api.cloudinary.com/v2/analysis/<cloud_name>/analyze/google_tagging`
   with Basic auth (`API_KEY:API_SECRET`) and body
   `{"source":{"asset_id":"<asset_id>"}}` — a subscribed account returns
   `200` with `data.analysis.label_annotations.labels`.
2. Upload API `explicit` with `ocr=adv_ocr` on an image containing text — a
   subscribed account returns an `ocr.adv_ocr` node.
3. Admin API `resource` with `phash=true&image_metadata=true` — available on
   all accounts.

## Enabling richer signals (optional)

If the project later activates add-ons (Google Auto Tagging, OCR Text
Detection, Cloudinary AI Vision), no Provera code changes are required: the
adapter already requests OCR on every run and attempts content tagging on
every run, so the corresponding signals switch from `unavailable` to
`obtained` automatically. Add-on enablement is a console/billing action and is
out of scope for this repository.

## Boundary

These are raw signals reported by Cloudinary for a specific asset. They are
not authenticity proof, and Phase 2 produces no score, status or verification
claim.

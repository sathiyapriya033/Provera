import type { ArtifactDelivery, VerificationArtifact } from "@/lib/cloudinary/artifact";
import type { QrAsset } from "@/lib/cloudinary/qr";
import type { ForensicStatus } from "@/lib/forensic/engine";
import type { VerificationRecord } from "@/lib/verification/record";

/**
 * Provera — Inspector Mode view model (Phase 7).
 *
 * Inspector Mode exposes the Cloudinary workflow directly: asset identity, the
 * recorded analysis, the structured metadata actually stored on the asset, the
 * artifact transformation with its signature and optimization parameters, and
 * the record ID.
 *
 * The point of the view is comparison. Provera writes a record and mirrors it
 * into Cloudinary structured metadata; this module lines the two up field by
 * field and states plainly where they agree and where they do not. It never
 * repairs a mismatch and never softens one into a vague note — a record whose
 * metadata was edited in the Media Library shows up here as a mismatch.
 *
 * This module is deliberately pure and free of runtime imports (only erased type
 * imports) so it can be unit tested with Node's native TypeScript stripping. The
 * Cloudinary calls live in `collect.ts`; the record facts are passed in.
 */

/** Version identifier of the inspection report schema. */
export const INSPECTION_VERSION = "provera-inspection@1";

/** Prefix of the structured metadata fields Provera owns on an asset. */
export const VERIFICATION_METADATA_PREFIX = "provera_";

/** How many generated derivatives the report previews. */
export const DERIVATIVE_PREVIEW_LIMIT = 6;

export type MetadataFieldState = "match" | "mismatch" | "missing";

export type MetadataFieldCheck = {
  field: string;
  /** The value the record implies, i.e. what Provera wrote. */
  expected: string | number;
  /** The value Cloudinary returns now, or null when the field is absent. */
  live: string | number | null;
  state: MetadataFieldState;
};

export type MetadataComparison = {
  fields: MetadataFieldCheck[];
  /** `provera_*` fields present on the asset that this record did not write. */
  extraLiveFields: string[];
  matchCount: number;
  mismatchCount: number;
  missingCount: number;
  /** True when nothing mismatched and nothing was missing. */
  matches: boolean;
};

export type AssetIdentityState =
  | "match"
  | "mismatch"
  /** The record does not hold this field, so nothing can be compared. */
  | "not_compared";

export type AssetIdentityCheck = {
  field: string;
  recorded: string | number | null;
  live: string | number | null;
  state: AssetIdentityState;
};

export type AssetIdentityOutcome = "consistent" | "changed" | "unknown";

export type AssetIdentityComparison = {
  checks: AssetIdentityCheck[];
  outcome: AssetIdentityOutcome;
  /** Field names that disagree between the record and the live asset. */
  mismatched: string[];
  /** Plain-language statements about each disagreement. */
  notes: string[];
};

export type LiveAssetFields = {
  assetId: string | null;
  publicId: string | null;
  resourceType: string | null;
  deliveryType: string | null;
  format: string | null;
  version: number | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  createdAt: string | null;
  lastUpdated: string | null;
  secureUrl: string | null;
  accessMode: string | null;
  predominantColors: { name: string; percent: number }[];
  phash: string | null;
  exifFieldCount: number;
  hasExif: boolean;
  imageMetadataKeys: string[];
  tags: string[];
  context: Record<string, string> | null;
  /** Admin API rate-limit counters for the read, when reported. */
  rateLimit: { limit: number | null; remaining: number | null } | null;
};

export type LiveAssetRead =
  | { available: true; fields: LiveAssetFields }
  | { available: false; httpStatus: number | null; reason: string };

export type DerivedAssetSummary = {
  id: string | null;
  format: string | null;
  bytes: number | null;
  /** Cloudinary's own signature for the derived transformation. */
  transformationSignature: string | null;
  secureUrl: string | null;
  /** Number of transformation segments, including the delivery segment. */
  componentCount: number;
};

export type DerivativeSummary = {
  /** Derivatives that carry this record's evidence in a text layer. */
  matching: number;
  /** Every derivative Cloudinary reported for the asset. */
  total: number;
  entries: DerivedAssetSummary[];
  truncated: boolean;
};

export type QrLiveRead =
  | {
      available: true;
      publicId: string;
      bytes: number | null;
      width: number | null;
      height: number | null;
      format: string | null;
      tags: string[];
      context: Record<string, string> | null;
    }
  | { available: false; reason: string };

export type ArtifactInspection =
  | { status: "verified"; artifact: VerificationArtifact; delivery: ArtifactDelivery }
  | { status: "unavailable"; reason: string };

export type InspectionReport = {
  inspectionVersion: string;
  generatedAt: string;
  record: {
    recordId: string;
    schemaVersion: string;
    score: number;
    status: ForensicStatus;
    coverage: number;
    signals: VerificationRecord["signals"];
    reasons: string[];
    flags: string[];
    context: string | null;
    analysisId: string | null;
    timestamp: string;
    engineVersion: string;
    recordHash: string;
    /** Recomputed from the stored record when the report was built. */
    integrityVerified: boolean;
  };
  asset: {
    /** What the record refers to, as captured at verification time. */
    recorded: VerificationRecord["asset"];
    identity: AssetIdentityComparison;
    live: LiveAssetRead;
  };
  metadata: MetadataComparison;
  qr: {
    asset: QrAsset | null;
    /** Why no QR asset could be produced, when that is the case. */
    failure: string | null;
    live: QrLiveRead | null;
  };
  artifact: ArtifactInspection;
  derivatives: DerivativeSummary;
  /**
   * What this report is and is not. The live read is a snapshot taken now; it
   * is not the analysis that produced the record, and it is not proof that the
   * photograph is authentic.
   */
  scope: string;
};

export const INSPECTION_SCOPE =
  "The live Cloudinary state in this report was read now, for this request only. " +
  "It is not the analysis that produced the record: the record keeps the normalized " +
  "signal values, while this view re-reads the asset, its structured metadata and its " +
  "generated derivatives. Agreement shows that the asset still carries the record's " +
  "evidence. It is not proof that the photograph is authentic, and the artifact can be " +
  "regenerated at any time.";

/** Cloudinary may return a structured field as a number or as a string. */
function normalizeValue(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}


/**
 * Compares the metadata a record implies against the metadata Cloudinary returns
 * for the asset. Comparison is by string form so a numeric field such as
 * `provera_score` matches whether the API returns 75 or "75".
 */
export function compareVerificationMetadata(
  expected: Record<string, string | number>,
  live: Record<string, unknown> | null,
): MetadataComparison {
  const fields: MetadataFieldCheck[] = [];
  let matchCount = 0;
  let mismatchCount = 0;
  let missingCount = 0;

  for (const [field, expectedValue] of Object.entries(expected)) {
    const rawLive = live && field in live ? live[field] : undefined;
    const liveValue = normalizeValue(
      typeof rawLive === "string" || typeof rawLive === "number"
        ? rawLive
        : null,
    );
    const state: MetadataFieldState =
      liveValue === null
        ? "missing"
        : liveValue === normalizeValue(expectedValue)
          ? "match"
          : "mismatch";
    if (state === "match") matchCount += 1;
    else if (state === "mismatch") mismatchCount += 1;
    else missingCount += 1;
    fields.push({ field, expected: expectedValue, live: liveValue, state });
  }

  const extraLiveFields = live
    ? Object.keys(live)
        .filter(
          (key) =>
            key.startsWith(VERIFICATION_METADATA_PREFIX) && !(key in expected),
        )
        .sort()
    : [];

  return {
    fields,
    extraLiveFields,
    matchCount,
    mismatchCount,
    missingCount,
    matches: mismatchCount === 0 && missingCount === 0,
  };
}

const IDENTITY_NOTES: Record<string, string> = {
  publicId:
    "The record's public ID does not resolve to the asset Cloudinary returned. The evidence and the stored file are not the same object.",
  format: "The stored format differs from the format the record was created against.",
  version:
    "Cloudinary reports a different asset version than the record was created against, so the file at this public ID was replaced after verification.",
  secureUrl:
    "The delivery URL differs from the one the record refers to. Delivery URLs can change without the asset changing, so this alone is not evidence of tampering.",
  resourceType:
    "The stored resource type differs from the one the record was created against.",
};

/**
 * Cross-checks the asset identity the record was created against against the
 * asset Cloudinary serves now. Fields the record never stored are reported as
 * `not_compared` rather than silently counted as agreement.
 */
export function compareAssetIdentity(
  recorded: VerificationRecord["asset"],
  live: LiveAssetFields | null,
): AssetIdentityComparison {
  const pairs: {
    field: string;
    recordedValue: string | number | null | undefined;
    liveValue: string | number | null | undefined;
  }[] = [
    {
      field: "publicId",
      recordedValue: recorded.publicId,
      liveValue: live?.publicId ?? null,
    },
    {
      field: "resourceType",
      recordedValue: recorded.resourceType,
      liveValue: live?.resourceType ?? null,
    },
    { field: "format", recordedValue: recorded.format, liveValue: live?.format ?? null },
    { field: "version", recordedValue: recorded.version, liveValue: live?.version ?? null },
    {
      field: "secureUrl",
      recordedValue: recorded.secureUrl,
      liveValue: live?.secureUrl ?? null,
    },
  ];

  const checks: AssetIdentityCheck[] = [];
  const mismatched: string[] = [];
  const notes: string[] = [];
  let comparable = 0;

  for (const pair of pairs) {
    const recordedValue = normalizeValue(pair.recordedValue);
    const liveValue = normalizeValue(pair.liveValue);
    let state: AssetIdentityState;
    if (recordedValue === null || liveValue === null) {
      state = "not_compared";
    } else if (recordedValue === liveValue) {
      state = "match";
      comparable += 1;
    } else {
      state = "mismatch";
      comparable += 1;
      mismatched.push(pair.field);
      notes.push(IDENTITY_NOTES[pair.field] ?? `The ${pair.field} differs.`);
    }
    checks.push({
      field: pair.field,
      recorded: recordedValue,
      live: liveValue,
      state,
    });
  }

  const outcome: AssetIdentityOutcome =
    mismatched.length > 0 ? "changed" : comparable > 0 ? "consistent" : "unknown";

  return { checks, outcome, mismatched, notes };
}


export type RawDerivedAsset = {
  id?: unknown;
  format?: unknown;
  bytes?: unknown;
  transformation?: unknown;
  transformation_signature?: unknown;
  secure_url?: unknown;
};

/**
 * Summarizes the derivatives Cloudinary has generated and cached for the asset.
 * Every artifact variant embeds the record ID in a text layer, so derivatives
 * whose transformation mentions the record ID are the ones that actually
 * rendered this record's evidence.
 */
export function summarizeDerivatives(
  derived: readonly RawDerivedAsset[],
  recordId: string,
): DerivativeSummary {
  const matching = derived.filter(
    (entry) =>
      typeof entry.transformation === "string" &&
      entry.transformation.includes(recordId),
  );

  const entries = matching
    .map<DerivedAssetSummary>((entry) => ({
      id: typeof entry.id === "string" ? entry.id : null,
      format: typeof entry.format === "string" ? entry.format : null,
      bytes: typeof entry.bytes === "number" ? entry.bytes : null,
      transformationSignature:
        typeof entry.transformation_signature === "string"
          ? entry.transformation_signature
          : null,
      secureUrl: typeof entry.secure_url === "string" ? entry.secure_url : null,
      componentCount:
        typeof entry.transformation === "string"
          ? entry.transformation.split("/").length
          : 0,
    }))
    .sort((left, right) => (right.bytes ?? 0) - (left.bytes ?? 0))
    .slice(0, DERIVATIVE_PREVIEW_LIMIT);

  return {
    matching: matching.length,
    total: derived.length,
    entries,
    truncated: matching.length > entries.length,
  };
}

export type InspectionInput = {
  record: VerificationRecord;
  /** Recomputed by the caller so this module stays free of runtime imports. */
  integrityVerified: boolean;
  /** `metadataValuesForRecord(record)`, supplied by the caller. */
  expectedMetadata: Record<string, string | number>;
  live: LiveAssetRead;
  liveMetadata: Record<string, unknown> | null;
  qr: { asset: QrAsset | null; failure: string | null; live: QrLiveRead | null };
  artifact: ArtifactInspection;
  derived: readonly RawDerivedAsset[];
  generatedAt: string;
};

/** Assembles the complete Inspector Mode report. Pure. */
export function buildInspectionReport(input: InspectionInput): InspectionReport {
  const { record } = input;
  return {
    inspectionVersion: INSPECTION_VERSION,
    generatedAt: input.generatedAt,
    record: {
      recordId: record.recordId,
      schemaVersion: record.schemaVersion,
      score: record.score,
      status: record.status,
      coverage: record.coverage,
      signals: record.signals,
      reasons: record.reasons,
      flags: record.flags,
      context: record.context,
      analysisId: record.analysisId,
      timestamp: record.timestamp,
      engineVersion: record.engineVersion,
      recordHash: record.recordHash,
      integrityVerified: input.integrityVerified,
    },
    asset: {
      recorded: record.asset,
      identity: compareAssetIdentity(
        record.asset,
        input.live.available ? input.live.fields : null,
      ),
      live: input.live,
    },
    metadata: compareVerificationMetadata(
      input.expectedMetadata,
      input.liveMetadata,
    ),
    qr: input.qr,
    artifact: input.artifact,
    derivatives: summarizeDerivatives(input.derived, record.recordId),
    scope: INSPECTION_SCOPE,
  };
}


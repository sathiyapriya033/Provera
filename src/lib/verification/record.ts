import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { ForensicResult, ForensicStatus } from "@/lib/forensic/engine";

/**
 * Provera — verification record, canonicalization and integrity hash (Phase4).
 *
 * The record identifies a specific verification state of a specific Cloudinary
 * asset. The recordHash is an application-level SHA-256 integrity hash: it
 * makes later tampering with the record detectable. It does NOT make the
 * original image immutable and does NOT prove historical authenticity.
 *
 * Exact hash input (documented): the canonical JSON serialization of the
 * complete record EXCEPT the `recordHash` field itself, where the canonical
 * form is JSON with lexicographically sorted object keys at every nesting
 * level and array elements kept in their original order.
 */

/** Version identifier of the record schema. */
export const RECORD_SCHEMA_VERSION = "provera-record@1";

/** Human-readable ID: PV-YYYY-XXXXXXXX (8 chars from an unambiguous alphabet). */
export const RECORD_ID_PATTERN = /^PV-\d{4}-[A-HJ-NP-Z2-9]{8}$/;

/** Alphabet without I, O, 0, 1 to avoid transcription errors. */
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type VerificationRecord = {
  recordId: string;
  schemaVersion: string;
  asset: {
    publicId: string;
    resourceType: string;
    format?: string;
    version?: number;
    secureUrl?: string;
  };
  score: number;
  status: ForensicStatus;
  signals: {
    metadataAvailability: number | null;
    ocrConsistency: number | null;
    visualConsistency: number | null;
    duplicateIndicator: number | null;
    mediaQuality: number | null;
  };
  /** Human-readable reasons, prefixed with their kind (Positive/Concern/Note). */
  reasons: string[];
  /** Machine-readable markers: `concern:<signal>` and `unavailable:<signal>`. */
  flags: string[];
  coverage: number;
  context: string | null;
  analysisId: string | null;
  timestamp: string;
  engineVersion: string;
  /** SHA-256 hex of the canonical record (excluded from the hash input). */
  recordHash: string;
};

/**
 * Generates a collision-resistant record ID:5 random bytes →8 base32 chars
 * (40 bits of entropy) plus the current year. Uniqueness against the store is
 * checked separately by the caller.
 */
export function createRecordId(now: Date = new Date()): string {
  const bytes = randomBytes(5);
  let index = 0;
  let value = 0;
  let bits = 0;
  let body = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      body += ID_ALPHABET[(value >>> bits) & 31];
      index += 1;
    }
  }
  if (index !== 8) {
    // Defensive:5 bytes yield exactly8 five-bit groups.
    throw new Error("Unexpected record ID encoding failure.");
  }
  return `PV-${now.getUTCFullYear()}-${body}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      sorted[key] = canonicalize(source[key]);
    }
    return sorted;
  }
  return value;
}

/** Deterministic serialization: sorted keys at every level, stable arrays. */
export function canonicalizeRecord(
  record: VerificationRecord,
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...record };
  delete body.recordHash;
  return canonicalize(body) as Record<string, unknown>;
}

/** SHA-256 hex over the canonical record JSON (recordHash excluded). */
export function computeRecordHash(record: VerificationRecord): string {
  const canonical = JSON.stringify(canonicalizeRecord(record));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Recomputes the hash from the stored record and compares in constant time. */
export function verifyRecordIntegrity(record: VerificationRecord): boolean {
  const expected = Buffer.from(computeRecordHash(record), "utf8");
  const actual = Buffer.from(record.recordHash ?? "", "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

const KIND_PREFIX: Record<"positive" | "concern" | "info", string> = {
  positive: "Positive",
  concern: "Concern",
  info: "Note",
};

/** Flattens engine reasons into human-readable strings, kind preserved. */
export function formatReasons(result: ForensicResult): string[] {
  return result.reasons.map(
    (reason) => `${KIND_PREFIX[reason.kind]}: ${reason.message}`,
  );
}

/**
 * Derives deterministic machine-readable flags from the engine result:
 * one marker per component signal — `unavailable:<signal>` when excluded,
 * `concern:<signal>` when the component produced at least one concern.
 */
export function deriveFlags(result: ForensicResult): string[] {
  const flags: string[] = [];
  const concernSignals = new Set(
    result.reasons
      .filter((reason) => reason.kind === "concern" && reason.signal !== "coverage")
      .map((reason) => reason.signal),
  );
  for (const component of result.components) {
    if (component.status === "unavailable") {
      flags.push(`unavailable:${component.signal}`);
    } else if (concernSignals.has(component.signal)) {
      flags.push(`concern:${component.signal}`);
    }
  }
  return flags;
}

export type RecordAssetInput = {
  publicId: string;
  resourceType: string;
  format?: string;
  version?: number;
  secureUrl?: string;
};

export type VerificationRecordInput = {
  recordId: string;
  asset: RecordAssetInput;
  result: ForensicResult;
  context: string | null;
  analysisId: string | null;
  /** ISO-8601 creation timestamp supplied by the caller. */
  timestamp: string;
};

/**
 * Assembles a complete record from a scoring result and computes its
 * integrity hash. Pure: identical inputs produce an identical recordHash.
 */
export function buildVerificationRecord(
  input: VerificationRecordInput,
): VerificationRecord {
  const scores = new Map(
    input.result.components.map((component) => [component.signal, component.score]),
  );

  const record: Omit<VerificationRecord, "recordHash"> = {
    recordId: input.recordId,
    schemaVersion: RECORD_SCHEMA_VERSION,
    asset: {
      publicId: input.asset.publicId,
      resourceType: input.asset.resourceType,
      ...(input.asset.format !== undefined ? { format: input.asset.format } : {}),
      ...(input.asset.version !== undefined ? { version: input.asset.version } : {}),
      ...(input.asset.secureUrl !== undefined
        ? { secureUrl: input.asset.secureUrl }
        : {}),
    },
    score: input.result.score,
    status: input.result.status,
    signals: {
      metadataAvailability: scores.get("metadata") ?? null,
      ocrConsistency: scores.get("ocrClaim") ?? null,
      visualConsistency: scores.get("visualContent") ?? null,
      duplicateIndicator: scores.get("duplicate") ?? null,
      mediaQuality: scores.get("mediaQuality") ?? null,
    },
    reasons: formatReasons(input.result),
    flags: deriveFlags(input.result),
    coverage: input.result.coverage,
    context: input.context,
    analysisId: input.analysisId,
    timestamp: input.timestamp,
    engineVersion: input.result.engineVersion,
  };

  const withHash = record as VerificationRecord;
  withHash.recordHash = computeRecordHash(withHash);
  return withHash;
}

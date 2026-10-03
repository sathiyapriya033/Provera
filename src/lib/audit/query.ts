import { RECORD_ID_PATTERN } from "../verification/record.ts";

/**
 * Provera — audit queue query model (Phase 8).
 *
 * The audit queue answers "which verifications exist, and which of them are
 * flagged". It deliberately adds no database: every row comes from Cloudinary,
 * retrieved with its structured metadata, and filtered on the `provera_*` values
 * the account itself holds.
 *
 * This module holds the query parsing and the filtering, both pure, so the rules
 * can be unit tested without a network call. `src/lib/cloudinary/audit.ts` does
 * the retrieval.
 *
 * Measured constraint, documented in docs/CLOUDINARY.md: this account's Search API
 * rejects `metadata_*` expressions with "Field … not supported" even though the
 * field definitions report `excluded_from_search: false`. So the status and score
 * filters run in the application over the metadata Cloudinary returns, not in
 * Cloudinary's index. `sortAuthority()` makes that split visible to the UI.
 */

export const AUDIT_STATUSES = ["VERIFIED", "REVIEW", "FLAGGED"] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export const AUDIT_SORTS = ["newest", "oldest", "score_desc", "score_asc"] as const;
export type AuditSort = (typeof AUDIT_SORTS)[number];

export const MAX_SCORE = 100;
export const DEFAULT_AUDIT_LIMIT = 25;
export const MAX_AUDIT_LIMIT = 100;

/** Cursors are opaque Cloudinary tokens; bound what we accept from a URL. */
const MAX_CURSOR_LENGTH = 512;
const CURSOR_PATTERN = /^[A-Za-z0-9+/=_-]+$/;

export type AuditQuery = {
  status: AuditStatus | null;
  minScore: number | null;
  maxScore: number | null;
  cursor: string | null;
  limit: number;
  sort: AuditSort;
};

/** A filter value the caller supplied that could not be used, and why. */
export type AuditQueryRejection = {
  field: string;
  value: string;
  reason: string;
};

export type ParsedAuditQuery = {
  query: AuditQuery;
  /** Ignored values, surfaced in the UI instead of being silently dropped. */
  rejected: AuditQueryRejection[];
};

/** Which side of the system decides the row order. */
export function sortAuthority(sort: AuditSort): "cloudinary" | "application" {
  return sort === "newest" || sort === "oldest" ? "cloudinary" : "application";
}

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

function parseScore(
  raw: string | null,
  field: string,
  rejected: AuditQueryRejection[],
): number | null {
  const expected = `must be a whole number between 0 and ${MAX_SCORE}`;
  if (raw === null || raw.trim() === "") return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    rejected.push({ field, value: trimmed, reason: expected });
    return null;
  }
  const parsed = Number(trimmed);
  if (parsed > MAX_SCORE) {
    rejected.push({ field, value: trimmed, reason: expected });
    return null;
  }
  return parsed;
}

/**
 * Normalizes raw search parameters into a usable query. Unknown or malformed
 * values are discarded and reported in `rejected` rather than failing the
 * request: a mistyped filter should show an empty result, not an error page.
 */
export function parseAuditQuery(
  params: Record<string, string | string[] | undefined>,
): ParsedAuditQuery {
  const rejected: AuditQueryRejection[] = [];

  const rawStatus = firstValue(params.status);
  let status: AuditStatus | null = null;
  if (rawStatus !== null && rawStatus.trim() !== "") {
    const upper = rawStatus.trim().toUpperCase();
    if ((AUDIT_STATUSES as readonly string[]).includes(upper)) {
      status = upper as AuditStatus;
    } else {
      rejected.push({
        field: "status",
        value: rawStatus,
        reason: `must be one of ${AUDIT_STATUSES.join(", ")}`,
      });
    }
  }

  const minScore = parseScore(firstValue(params.minScore), "minScore", rejected);
  const rawMaxScore = parseScore(firstValue(params.maxScore), "maxScore", rejected);
  let maxScore = rawMaxScore;
  if (minScore !== null && maxScore !== null && maxScore < minScore) {
    rejected.push({
      field: "maxScore",
      value: String(maxScore),
      reason: `must be greater than or equal to minScore (${minScore})`,
    });
    maxScore = null;
  }

  const rawCursor = firstValue(params.cursor);
  let cursor: string | null = null;
  if (rawCursor !== null && rawCursor.trim() !== "") {
    const trimmed = rawCursor.trim();
    if (trimmed.length > MAX_CURSOR_LENGTH || !CURSOR_PATTERN.test(trimmed)) {
      rejected.push({ field: "cursor", value: trimmed, reason: "is not a valid page cursor" });
    } else {
      cursor = trimmed;
    }
  }

  const rawLimit = firstValue(params.limit);
  let limit = DEFAULT_AUDIT_LIMIT;
  if (rawLimit !== null && rawLimit.trim() !== "") {
    const trimmed = rawLimit.trim();
    if (/^\d+$/.test(trimmed) && Number(trimmed) >= 1 && Number(trimmed) <= MAX_AUDIT_LIMIT) {
      limit = Number(trimmed);
    } else {
      rejected.push({
        field: "limit",
        value: trimmed,
        reason: `must be a whole number from 1 to ${MAX_AUDIT_LIMIT}`,
      });
    }
  }

  const rawSort = firstValue(params.sort);
  let sort: AuditSort = "newest";
  if (rawSort !== null && rawSort.trim() !== "") {
    const lower = rawSort.trim().toLowerCase();
    if ((AUDIT_SORTS as readonly string[]).includes(lower)) {
      sort = lower as AuditSort;
    } else {
      rejected.push({
        field: "sort",
        value: rawSort,
        reason: `must be one of ${AUDIT_SORTS.join(", ")}`,
      });
    }
  }

  return {
    query: { status, minScore, maxScore, cursor, limit, sort },
    rejected,
  };
}

/** The `provera_*` values read from a Cloudinary asset. */
export type ProveraMetadata = {
  recordId: string;
  status: string | null;
  score: number | null;
  recordHash: string | null;
  timestamp: string | null;
  version: string | null;
  flags: string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

/**
 * Reads the Provera metadata off a Cloudinary asset, or returns null when the
 * asset is not a verification record.
 *
 * The record ID is validated against the real ID pattern: a tampered or malformed
 * `provera_record_id` must not become a working link, and an asset whose ID does
 * not parse is reported as "not a record" rather than as a broken queue entry.
 */
export function readProveraMetadata(metadata: unknown): ProveraMetadata | null {
  if (!isPlainObject(metadata)) return null;
  const recordId = readString(metadata, "provera_record_id");
  if (recordId === null || !RECORD_ID_PATTERN.test(recordId)) return null;

  const flags = readString(metadata, "provera_flags");
  return {
    recordId,
    status: readString(metadata, "provera_status"),
    score: readNumber(metadata, "provera_score"),
    recordHash: readString(metadata, "provera_record_hash"),
    timestamp: readString(metadata, "provera_timestamp"),
    version: readString(metadata, "provera_version"),
    flags:
      flags === null || flags === ""
        ? []
        : flags
            .split(",")
            .map((flag) => flag.trim())
            .filter((flag) => flag.length > 0),
  };
}

/**
 * Applies the status and score filters to a record's metadata.
 *
 * A record whose score is missing is excluded by any score filter, because a
 * range cannot be tested against an unknown value; it is not quietly treated as
 * zero. A status filter only matches an exact status.
 */
export function matchesAuditFilters(
  metadata: ProveraMetadata,
  query: AuditQuery,
): boolean {
  if (query.status !== null && metadata.status !== query.status) return false;
  if (query.minScore !== null) {
    if (metadata.score === null || metadata.score < query.minScore) return false;
  }
  if (query.maxScore !== null) {
    if (metadata.score === null || metadata.score > query.maxScore) return false;
  }
  return true;
}


/** One retrieved Cloudinary asset, normalized for the queue table. */
export type AuditRow = {
  recordId: string;
  publicId: string;
  assetId: string | null;
  secureUrl: string | null;
  format: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  uploadedAt: string | null;
  status: string | null;
  score: number | null;
  recordHash: string | null;
  verifiedAt: string | null;
  engineVersion: string | null;
  flags: string[];
};

export type RawAuditResource = {
  public_id?: unknown;
  asset_id?: unknown;
  secure_url?: unknown;
  format?: unknown;
  bytes?: unknown;
  width?: unknown;
  height?: unknown;
  created_at?: unknown;
  uploaded_at?: unknown;
  metadata?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Normalizes a search result into a queue row, or null when it is not a record. */
export function toAuditRow(resource: RawAuditResource): AuditRow | null {
  const metadata = readProveraMetadata(resource.metadata);
  if (metadata === null) return null;
  return {
    recordId: metadata.recordId,
    publicId: asString(resource.public_id) ?? "unknown",
    assetId: asString(resource.asset_id),
    secureUrl: asString(resource.secure_url),
    format: asString(resource.format),
    bytes: asNumber(resource.bytes),
    width: asNumber(resource.width),
    height: asNumber(resource.height),
    uploadedAt: asString(resource.created_at) ?? asString(resource.uploaded_at),
    status: metadata.status,
    score: metadata.score,
    recordHash: metadata.recordHash,
    verifiedAt: metadata.timestamp,
    engineVersion: metadata.version,
    flags: metadata.flags,
  };
}

/**
 * Orders rows over the retrieved page. Only the score orders need the
 * application: Cloudinary cannot sort by a structured metadata field on this
 * account (measured), so `sortAuthority()` tells the UI to say so.
 */
export function sortAuditRows(rows: AuditRow[], sort: AuditSort): AuditRow[] {
  const sorted = [...rows];
  if (sort === "score_desc" || sort === "score_asc") {
    const direction = sort === "score_desc" ? -1 : 1;
    sorted.sort((left, right) => {
      if (left.score === null && right.score === null) return 0;
      // A record with no score sorts last in both directions: an unknown score is
      // never presented as the best or the worst result.
      if (left.score === null) return 1;
      if (right.score === null) return -1;
      return (left.score - right.score) * direction;
    });
  }
  return sorted;
}

/** The Cloudinary search expression for the queue. */
export function auditSearchExpression(): string {
  return "resource_type:image";
}

/** The sort direction Cloudinary applies to `created_at` for this query. */
export function auditCloudinarySort(sort: AuditSort): "asc" | "desc" {
  return sort === "oldest" ? "asc" : "desc";
}

/** True when no filter is active, so the queue can say "showing everything". */
export function isUnfiltered(query: AuditQuery): boolean {
  return query.status === null && query.minScore === null && query.maxScore === null;
}


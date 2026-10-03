import { v2 as cloudinary } from "cloudinary";
import {
  auditCloudinarySort,
  auditSearchExpression,
  isUnfiltered,
  matchesAuditFilters,
  readProveraMetadata,
  sortAuditRows,
  toAuditRow,
  type AuditQuery,
  type AuditRow,
  type RawAuditResource,
} from "@/lib/audit/query";
import { getCloudinaryConfig, type CloudinaryConfig } from "@/lib/cloudinary/config";
import { describeCloudinaryError } from "@/lib/cloudinary/upload";

/**
 * Provera — audit queue retrieval from Cloudinary (Phase 8).
 *
 * The queue has no database of its own. Every row is a Cloudinary asset read
 * through the Search API with its structured metadata attached, and every filter
 * is applied to the `provera_*` values the account holds. If the account is
 * deleted, the queue is empty — which is the point: the metadata mirror is the
 * index.
 *
 * Measured on this account (see docs/CLOUDINARY.md): the Search API rejects
 * `metadata_*` expressions with "Field … not supported" and rejects sorting by a
 * structured field, and aggregations are unavailable on this plan. Retrieval,
 * `created_at` ordering and pagination all work, and `with_field("metadata")`
 * attaches the values, so the status and score filters are applied here over
 * that metadata. `filterAuthority()` in the report tells the UI to say so.
 *
 * A consequence worth stating in the UI: because the filter runs after retrieval,
 * a page can contain no matching rows while later pages still hold some. The
 * result therefore reports `scanned` and `nextCursor` and the UI offers a next
 * page rather than claiming there is nothing.
 */

export class AuditQueryError extends Error {
  readonly code = "AUDIT_QUERY_FAILED" as const;
  readonly httpStatus: number;

  constructor(message: string, httpStatus: number | null) {
    super(message);
    this.name = "AuditQueryError";
    this.httpStatus = httpStatus ?? 502;
  }
}

export type AuditResult = {
  rows: AuditRow[];
  /** Assets Cloudinary returned for this page. */
  scanned: number;
  /** Rows that carried Provera metadata and passed the filters. */
  matched: number;
  /** Assets on this page that are not verification records (QR images, uploads). */
  withoutRecordMetadata: number;
  /** Cloudinary's total for the expression, before Provera's filters. */
  cloudinaryTotal: number;
  nextCursor: string | null;
  /** Whether the status and score filters ran in Provera or in Cloudinary. */
  filterAuthority: "application" | "cloudinary";
  sortAuthority: "cloudinary" | "application";
  /** True when this page had no matches but Cloudinary has more to give. */
  pageExhaustedWithoutMatch: boolean;
};

/**
 * Cloudinary caps a single search page. The queue asks for a bounded page and
 * reports what it scanned; it never silently loops the whole account.
 */
const MAX_PAGE_SIZE = 100;

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function searchAuditQueue(
  query: AuditQuery,
  config: CloudinaryConfig,
): Promise<AuditResult> {
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  const pageSize = Math.min(Math.max(query.limit, 1), MAX_PAGE_SIZE);

  let response: unknown;
  try {
    const request = cloudinary.search
      .expression(auditSearchExpression())
      .sort_by("created_at", auditCloudinarySort(query.sort))
      .max_results(pageSize)
      .with_field("metadata");
    if (query.cursor) request.next_cursor(query.cursor);
    response = await request.execute();
  } catch (error) {
    const shaped = error as { error?: { http_code?: unknown } };
    const status = asNumber(shaped?.error?.http_code);
    throw new AuditQueryError(
      describeCloudinaryError(error).message
        .split(config.apiSecret)
        .join("[redacted]"),
      status,
    );
  }

  if (!isPlainObject(response)) {
    throw new AuditQueryError(
      "Cloudinary returned a search response that was not an object.",
      null,
    );
  }

  const resources = Array.isArray(response.resources)
    ? (response.resources as RawAuditResource[])
    : [];
  const cloudinaryTotal = asNumber(response.total_count) ?? resources.length;
  const nextCursor =
    typeof response.next_cursor === "string" && response.next_cursor.length > 0
      ? response.next_cursor
      : null;

  let withoutRecordMetadata = 0;
  const rows: AuditRow[] = [];
  for (const resource of resources) {
    const metadata = readProveraMetadata(resource.metadata);
    if (metadata === null) {
      withoutRecordMetadata += 1;
      continue;
    }
    if (!matchesAuditFilters(metadata, query)) continue;
    const row = toAuditRow(resource);
    if (row !== null) rows.push(row);
  }

  return {
    rows: sortAuditRows(rows, query.sort),
    scanned: resources.length,
    matched: rows.length,
    withoutRecordMetadata,
    cloudinaryTotal,
    nextCursor,
    filterAuthority: "application",
    sortAuthority:
      query.sort === "newest" || query.sort === "oldest" ? "cloudinary" : "application",
    pageExhaustedWithoutMatch: rows.length === 0 && nextCursor !== null,
  };
}

/** Convenience wrapper for callers that only have a configured environment. */
export async function searchAuditQueueFromEnv(query: AuditQuery): Promise<AuditResult> {
  return searchAuditQueue(query, getCloudinaryConfig());
}

export { isUnfiltered };

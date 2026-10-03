import { NextResponse } from "next/server";
import { parseAuditQuery, type AuditQueryRejection, type AuditRow } from "@/lib/audit/query";
import { AuditQueryError, searchAuditQueueFromEnv } from "@/lib/cloudinary/audit";
import { CloudinaryConfigError } from "@/lib/cloudinary/config";
import type { ApiErrorCode, ApiResponse } from "@/types";

/**
 * GET /api/assets — the audit queue as JSON (Phase 8).
 *
 * Backed by Cloudinary's Search API and the `provera_*` structured metadata on each
 * asset, not by a queue database. Accepted parameters: `status`, `minScore`,
 * `maxScore`, `sort`, `limit`, `cursor`.
 *
 * A filter value that cannot be used is reported in `rejected` and the request
 * still succeeds with the rest of the filters applied, so a mistyped filter is
 * visible rather than silently ignored. `filterAuthority` and `sortAuthority` state
 * which side performed the work — on this account the metadata filters run in
 * Provera because Cloudinary's Search API cannot index these fields.
 */

type AssetsPayload = {
  rows: AuditRow[];
  scanned: number;
  matched: number;
  withoutRecordMetadata: number;
  cloudinaryTotal: number;
  nextCursor: string | null;
  filterAuthority: "application" | "cloudinary";
  sortAuthority: "cloudinary" | "application";
  pageExhaustedWithoutMatch: boolean;
  rejected: AuditQueryRejection[];
  applied: {
    status: string | null;
    minScore: number | null;
    maxScore: number | null;
    sort: string;
    limit: number;
  };
};

function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  for (const key of ["status", "minScore", "maxScore", "sort", "limit", "cursor"]) {
    const value = url.searchParams.get(key);
    if (value !== null) raw[key] = value;
  }

  const { query, rejected } = parseAuditQuery(raw);

  try {
    const result = await searchAuditQueueFromEnv(query);
    return NextResponse.json(
      {
        ok: true,
        data: {
          rows: result.rows,
          scanned: result.scanned,
          matched: result.matched,
          withoutRecordMetadata: result.withoutRecordMetadata,
          cloudinaryTotal: result.cloudinaryTotal,
          nextCursor: result.nextCursor,
          filterAuthority: result.filterAuthority,
          sortAuthority: result.sortAuthority,
          pageExhaustedWithoutMatch: result.pageExhaustedWithoutMatch,
          rejected,
          applied: {
            status: query.status,
            minScore: query.minScore,
            maxScore: query.maxScore,
            sort: query.sort,
            limit: query.limit,
          },
        } satisfies AssetsPayload,
      } satisfies ApiResponse<AssetsPayload>,
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof CloudinaryConfigError) {
      return errorResponse("INTERNAL_ERROR", error.message, 500);
    }
    if (error instanceof AuditQueryError) {
      return errorResponse("ANALYSIS_FAILED", error.message, error.httpStatus);
    }
    console.error(
      "Unexpected audit query error:",
      error instanceof Error ? error.message : "non-Error object (contents suppressed)",
    );
    return errorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred while reading the audit queue.",
      500,
    );
  }
}

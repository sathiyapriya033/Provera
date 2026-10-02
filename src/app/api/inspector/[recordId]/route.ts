import { NextResponse } from "next/server";
import { CloudinaryConfigError } from "@/lib/cloudinary/config";
import { collectInspection } from "@/lib/inspection/collect";
import type { InspectionReport } from "@/lib/inspection/inspect";
import { RECORD_ID_PATTERN } from "@/lib/verification/record";
import { VerificationStoreError } from "@/lib/verification/store";
import type { ApiErrorCode, ApiResponse } from "@/types";

/**
 * GET /api/inspector/:recordId — Inspector Mode report (Phase 7).
 *
 * The machine-readable twin of the `/inspector` page: it returns exactly the
 * report the page renders, so the Cloudinary workflow can be inspected without a
 * browser. The API secret is never included — the asset is read, the signed URL
 * is derived on the server, and only results are returned.
 *
 * Sections that cannot be produced are reported inside the report as
 * unavailable with their reason; only a missing record or missing credentials
 * fail the request.
 */

function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ recordId: string }> },
) {
  const { recordId } = await params;

  if (!RECORD_ID_PATTERN.test(recordId)) {
    return errorResponse(
      "INVALID_INPUT",
      `"${recordId}" is not a valid record ID. Expected the form PV-YYYY-XXXXXXXX.`,
      400,
    );
  }

  try {
    const report: InspectionReport = await collectInspection(recordId);
    return NextResponse.json(
      { ok: true, data: report } satisfies ApiResponse<InspectionReport>,
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof CloudinaryConfigError) {
      return errorResponse("INTERNAL_ERROR", error.message, 500);
    }
    if (error instanceof VerificationStoreError) {
      const notFound = error.code === "RECORD_NOT_FOUND";
      return errorResponse(
        notFound ? "RECORD_NOT_FOUND" : "VERIFICATION_FAILED",
        error.message,
        notFound ? 404 : 500,
      );
    }
    console.error(
      "Unexpected inspection error:",
      error instanceof Error ? error.message : "non-Error object (contents suppressed)",
    );
    return errorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred while inspecting this record.",
      500,
    );
  }
}

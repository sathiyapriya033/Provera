import { NextResponse } from "next/server";
import {
  RECORD_ID_PATTERN,
  computeRecordHash,
  type VerificationRecord,
} from "@/lib/verification/record";
import { VerificationStoreError, getRecord } from "@/lib/verification/store";
import type { ApiErrorCode, ApiResponse } from "@/types";

/**
 * GET /api/verify/:recordId — retrieves a stored verification record (Phase4).
 *
 * Returns the persisted record plus an integrity check that reproduces the
 * record hash from the canonical record data. The hash is an application-level
 * tamper-evidence check: it does not make the original image immutable and does
 * not prove historical authenticity.
 */

type RecordPayload = {
  record: VerificationRecord;
  integrity: { verified: boolean; computedHash: string };
};

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
    const record = await getRecord(recordId);
    const computedHash = computeRecordHash(record);
    return NextResponse.json(
      {
        ok: true,
        data: {
          record,
          integrity: {
            verified: computedHash === record.recordHash,
            computedHash,
          },
        } satisfies RecordPayload,
      } satisfies ApiResponse<RecordPayload>,
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof VerificationStoreError) {
      return errorResponse(
        error.code === "RECORD_NOT_FOUND" ? "RECORD_NOT_FOUND" : "VERIFICATION_FAILED",
        error.message,
        error.code === "RECORD_NOT_FOUND" ? 404 : 500,
      );
    }
    console.error(
      "Unexpected record retrieval error:",
      error instanceof Error ? error.message : "non-Error object (contents suppressed)",
    );
    return errorResponse(
      "VERIFICATION_FAILED",
      "An unexpected error occurred while retrieving the verification record.",
      500,
    );
  }
}

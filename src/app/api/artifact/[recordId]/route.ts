import { NextResponse } from "next/server";
import {
  ARTIFACT_SIGNATURE_NOTE,
  ArtifactError,
  artifactInputFromRecord,
  buildVerificationArtifact,
  probeArtifactDelivery,
  type ArtifactDelivery,
  type VerificationArtifact,
} from "@/lib/cloudinary/artifact";
import { CloudinaryConfigError, getCloudinaryConfig } from "@/lib/cloudinary/config";
import { RECORD_ID_PATTERN } from "@/lib/verification/record";
import { VerificationStoreError, getRecord } from "@/lib/verification/store";
import type { ApiErrorCode, ApiResponse } from "@/types";

/**
 * GET /api/artifact/:recordId — signed Cloudinary verification artifact (Phase 5).
 *
 * Builds a dynamic transformation of the verified asset from the stored record,
 * signs it with the account API secret, and then confirms with a HEAD request
 * that Cloudinary really serves an image. A failed or non-image response is
 * reported as ARTIFACT_FAILED; a successful artifact is never fabricated.
 */

type ArtifactPayload = {
  artifact: VerificationArtifact;
  delivery: ArtifactDelivery;
  signatureNote: string;
};

function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

/** Public application URL; falls back to the documented local default. */
function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return configured && configured.length > 0 ? configured : "http://localhost:3000";
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
    const artifact = buildVerificationArtifact(
      artifactInputFromRecord(record, getAppUrl()),
      getCloudinaryConfig(),
    );
    const delivery = await probeArtifactDelivery(artifact.url);

    return NextResponse.json(
      {
        ok: true,
        data: { artifact, delivery, signatureNote: ARTIFACT_SIGNATURE_NOTE },
      } satisfies ApiResponse<ArtifactPayload>,
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof CloudinaryConfigError) {
      return errorResponse("INTERNAL_ERROR", error.message, 500);
    }
    if (error instanceof ArtifactError) {
      return errorResponse("ARTIFACT_FAILED", error.message, 502);
    }
    if (error instanceof VerificationStoreError) {
      return errorResponse(
        error.code === "RECORD_NOT_FOUND" ? "RECORD_NOT_FOUND" : "VERIFICATION_FAILED",
        error.message,
        error.code === "RECORD_NOT_FOUND" ? 404 : 500,
      );
    }
    console.error(
      "Unexpected artifact error:",
      error instanceof Error ? error.message : "non-Error object (contents suppressed)",
    );
    return errorResponse(
      "ARTIFACT_FAILED",
      "An unexpected error occurred while generating the verification artifact.",
      500,
    );
  }
}
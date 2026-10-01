import { NextResponse } from "next/server";
import {
  CloudinaryAnalysisError,
  analyzeAsset,
} from "@/lib/cloudinary/analysis";
import { CloudinaryConfigError } from "@/lib/cloudinary/config";
import { calculateConsistencyScore } from "@/lib/forensic/engine";
import { mapAnalysisToEngineInput } from "@/lib/forensic/map-analysis";
import {
  MetadataAttachError,
  attachVerificationMetadata,
} from "@/lib/verification/metadata";
import {
  allocateRecordId,
  deleteRecord,
  saveRecord,
  VerificationStoreError,
} from "@/lib/verification/store";
import {
  buildVerificationRecord,
  verifyRecordIntegrity,
  type RecordAssetInput,
  type VerificationRecord,
} from "@/lib/verification/record";
import type {
  ApiErrorCode,
  ApiResponse,
  NormalizedAnalysis,
} from "@/types";

/**
 * POST /api/verify — creates and persists a verification record (Phase4).
 *
 * The record is authoritative because the server re-runs the Cloudinary
 * analysis for the supplied asset instead of trusting a client-supplied
 * analysis payload: a persisted record must not be forgeable by editing
 * request fields. The scoring input therefore comes from server-observed data,
 * exactly like the /api/score pipeline.
 *
 * Order of operations: build → persist → attach Cloudinary metadata. If the
 * metadata update fails, the persisted record is rolled back and the caller
 * receives an error rather than a "completed" record (docs/ARCHITECTURE.md).
 */

const MAX_PUBLIC_ID_CHARS = 1024;
const MAX_CONTEXT_CHARS = 2000;
const REFERENCE_HASH_PATTERN = /^[0-9a-fA-F]{16}$/;
const MAX_REFERENCE_HASHES = 100;

type VerifyPayload = {
  record: VerificationRecord;
  integrityVerified: boolean;
  metadataAttached: true;
};

function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

/**
 * Reads asset identity from the analysis rawSummary produced by the server.
 * `resourceType` defaults to "image" because the application only accepts
 * image uploads; every other field is omitted rather than invented.
 */
function assetFromAnalysis(analysis: NormalizedAnalysis): RecordAssetInput {
  const raw = analysis.rawSummary as unknown;
  const summary =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const resourceRaw = summary.resource;
  const resource =
    typeof resourceRaw === "object" &&
    resourceRaw !== null &&
    !Array.isArray(resourceRaw)
      ? (resourceRaw as Record<string, unknown>)
      : {};

  const format =
    typeof resource.format === "string" && resource.format.length > 0
      ? resource.format
      : undefined;
  const version =
    typeof resource.version === "number" && Number.isFinite(resource.version)
      ? resource.version
      : undefined;
  const secureUrl =
    typeof resource.secure_url === "string" && resource.secure_url.length > 0
      ? resource.secure_url
      : undefined;
  const resourceType =
    typeof resource.resource_type === "string" && resource.resource_type.length > 0
      ? resource.resource_type
      : "image";

  return { publicId: analysis.publicId, resourceType, format, version, secureUrl };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      "INVALID_INPUT",
      "Expected a valid JSON body with a 'publicId' field.",
      400,
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return errorResponse(
      "INVALID_INPUT",
      "Expected a JSON object body with a 'publicId' field.",
      400,
    );
  }

  const { publicId, context, referenceHashes } = body as Record<string, unknown>;

  if (
    typeof publicId !== "string" ||
    publicId.trim().length === 0 ||
    publicId.length > MAX_PUBLIC_ID_CHARS
  ) {
    return errorResponse(
      "INVALID_INPUT",
      `A non-empty 'publicId' string (at most ${MAX_PUBLIC_ID_CHARS} characters) is required.`,
      400,
    );
  }

  let normalizedContext: string | null = null;
  if (context !== undefined && context !== null) {
    if (typeof context !== "string" || context.length > MAX_CONTEXT_CHARS) {
      return errorResponse(
        "INVALID_INPUT",
        `'context' must be a string of at most ${MAX_CONTEXT_CHARS} characters.`,
        400,
      );
    }
    const trimmed = context.trim();
    normalizedContext = trimmed.length > 0 ? trimmed : null;
  }

  let references: string[] = [];
  if (referenceHashes !== undefined && referenceHashes !== null) {
    if (
      !Array.isArray(referenceHashes) ||
      referenceHashes.length > MAX_REFERENCE_HASHES
    ) {
      return errorResponse(
        "INVALID_INPUT",
        `'referenceHashes' must be an array of at most ${MAX_REFERENCE_HASHES} perceptual hashes.`,
        400,
      );
    }
    if (
      !referenceHashes.every(
        (hash) => typeof hash === "string" && REFERENCE_HASH_PATTERN.test(hash),
      )
    ) {
      return errorResponse(
        "INVALID_INPUT",
        "Each entry in 'referenceHashes' must be a16-character hex perceptual hash.",
        400,
      );
    }
    references = referenceHashes as string[];
  }

  try {
    const analysis = await analyzeAsset({
      publicId: publicId.trim(),
      context: normalizedContext,
    });
    const result = calculateConsistencyScore(
      mapAnalysisToEngineInput(analysis, references),
    );

    const record = buildVerificationRecord({
      recordId: await allocateRecordId(),
      asset: assetFromAnalysis(analysis),
      result,
      context: analysis.context,
      analysisId: analysis.analysisId,
      timestamp: new Date().toISOString(),
    });

    await saveRecord(record);

    try {
      await attachVerificationMetadata(record);
    } catch (error) {
      // Roll back so a failed metadata update never leaves a record that looks
      // completed (docs/ARCHITECTURE.md failure rule).
      await deleteRecord(record.recordId).catch(() => {
        console.warn(
          `Verification record ${record.recordId} could not be rolled back after a metadata failure.`,
        );
      });
      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          record,
          integrityVerified: verifyRecordIntegrity(record),
          metadataAttached: true,
        } satisfies VerifyPayload,
      } satisfies ApiResponse<VerifyPayload>,
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof CloudinaryConfigError) {
      return errorResponse("INTERNAL_ERROR", error.message, 500);
    }
    if (error instanceof CloudinaryAnalysisError) {
      const code: ApiErrorCode =
        error.code === "ANALYSIS_UNAVAILABLE"
          ? "ANALYSIS_UNAVAILABLE"
          : "ANALYSIS_FAILED";
      return errorResponse(code, error.message, error.httpStatus);
    }
    if (error instanceof MetadataAttachError) {
      return errorResponse("METADATA_UPDATE_FAILED", error.message, 502);
    }
    if (error instanceof VerificationStoreError) {
      return errorResponse(
        error.code === "RECORD_NOT_FOUND" ? "RECORD_NOT_FOUND" : "VERIFICATION_FAILED",
        error.message,
        error.code === "RECORD_NOT_FOUND" ? 404 : 500,
      );
    }
    console.error(
      "Unexpected verification error:",
      error instanceof Error ? error.message : "non-Error object (contents suppressed)",
    );
    return errorResponse(
      "VERIFICATION_FAILED",
      "An unexpected error occurred while creating the verification record.",
      500,
    );
  }
}
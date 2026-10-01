import { NextResponse } from "next/server";
import { CloudinaryAnalysisError, analyzeAsset } from "@/lib/cloudinary/analysis";
import { CloudinaryConfigError } from "@/lib/cloudinary/config";
import type { ApiErrorCode, ApiResponse, NormalizedAnalysis } from "@/types";

const MAX_PUBLIC_ID_CHARS = 1024;
const MAX_CONTEXT_CHARS = 2000;

function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
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

  const { publicId, context } = body as Record<string, unknown>;

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

  try {
    const analysis: NormalizedAnalysis = await analyzeAsset({
      publicId: publicId.trim(),
      context: normalizedContext,
    });
    return NextResponse.json(
      { ok: true, data: { analysis } } satisfies ApiResponse<{
        analysis: NormalizedAnalysis;
      }>,
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof CloudinaryConfigError) {
      return errorResponse("INTERNAL_ERROR", error.message, 500);
    }
    if (error instanceof CloudinaryAnalysisError) {
      const code: ApiErrorCode =
        error.code === "ANALYSIS_UNAVAILABLE" ? "ANALYSIS_UNAVAILABLE" : "ANALYSIS_FAILED";
      return errorResponse(code, error.message, error.httpStatus);
    }
    console.error(
      "Unexpected analysis error:",
      error instanceof Error ? error.message : "non-Error object (contents suppressed)",
    );
    return errorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred while analyzing the asset.",
      500,
    );
  }
}

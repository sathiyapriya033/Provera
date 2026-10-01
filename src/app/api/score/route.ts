import { NextResponse } from "next/server";
import {
  calculateConsistencyScore,
  type ForensicResult,
} from "@/lib/forensic/engine";
import { mapAnalysisToEngineInput } from "@/lib/forensic/map-analysis";
import type { ApiResponse, NormalizedAnalysis } from "@/types";

const REFERENCE_HASH_PATTERN = /^[0-9a-fA-F]{16}$/;
const MAX_REFERENCE_HASHES = 100;

function errorResponse(
  code: "INVALID_INPUT" | "INTERNAL_ERROR",
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
      "Expected a valid JSON body with an 'analysis' field.",
      400,
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return errorResponse(
      "INVALID_INPUT",
      "Expected a JSON object body with an 'analysis' field.",
      400,
    );
  }

  const { analysis, referenceHashes } = body as Record<string, unknown>;

  if (typeof analysis !== "object" || analysis === null || Array.isArray(analysis)) {
    return errorResponse(
      "INVALID_INPUT",
      "The 'analysis' field must be a NormalizedAnalysis object returned by /api/analyze.",
      400,
    );
  }

  let references: string[] = [];
  if (referenceHashes !== undefined && referenceHashes !== null) {
    if (!Array.isArray(referenceHashes) || referenceHashes.length > MAX_REFERENCE_HASHES) {
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
    const result: ForensicResult = calculateConsistencyScore(
      mapAnalysisToEngineInput(
        analysis as unknown as NormalizedAnalysis,
        references,
      ),
    );
    return NextResponse.json(
      { ok: true, data: { result } } satisfies ApiResponse<{ result: ForensicResult }>,
      { status: 200 },
    );
  } catch (error) {
    console.error(
      "Unexpected scoring error:",
      error instanceof Error ? error.message : "non-Error object (contents suppressed)",
    );
    return errorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred while calculating the score.",
      500,
    );
  }
}

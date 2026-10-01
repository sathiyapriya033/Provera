import { NextResponse } from "next/server";
import { CloudinaryConfigError } from "@/lib/cloudinary/config";
import { CloudinaryUploadError, uploadImageAsset } from "@/lib/cloudinary/upload";
import {
  detectImageMimeType,
  validateImageFile,
} from "@/lib/validation/image";
import type { ApiErrorCode, ApiResponse, UploadedAsset } from "@/types";

function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(
      "INVALID_INPUT",
      "Expected multipart/form-data with a 'file' field.",
      400,
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return errorResponse("INVALID_INPUT", "Missing 'file' field.", 400);
  }

  const validation = validateImageFile({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (!validation.ok) {
    return errorResponse("INVALID_INPUT", validation.message, 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detectedType = detectImageMimeType(bytes);
  if (!detectedType || detectedType !== validation.mimeType) {
    return errorResponse(
      "INVALID_INPUT",
      "File content does not match its declared image type.",
      400,
    );
  }

  try {
    const asset = await uploadImageAsset({
      bytes,
      mimeType: validation.mimeType,
      originalName: file.name,
    });
    const body: ApiResponse<{ asset: UploadedAsset }> = {
      ok: true,
      data: { asset },
    };
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    if (error instanceof CloudinaryConfigError) {
      return errorResponse("INTERNAL_ERROR", error.message, 500);
    }
    if (error instanceof CloudinaryUploadError) {
      const status = error.code === "UNAUTHORIZED" ? 401 : 502;
      return errorResponse(error.code, error.message, status);
    }
    console.error(
      "Unexpected upload error:",
      error instanceof Error ? error.message : "non-Error object (contents suppressed)",
    );
    return errorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred while uploading.",
      500,
    );
  }
}

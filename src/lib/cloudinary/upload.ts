import { Buffer } from "node:buffer";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import type { UploadedAsset } from "@/types";
import { getCloudinaryConfig } from "./config";

const UPLOAD_FOLDER = "provera";

export type UploadImageInput = {
  bytes: Uint8Array;
  mimeType: string;
  originalName: string;
};

export class CloudinaryUploadError extends Error {
  readonly code: "UPLOAD_FAILED" | "UNAUTHORIZED";

  constructor(code: "UPLOAD_FAILED" | "UNAUTHORIZED", message: string) {
    super(message);
    this.name = "CloudinaryUploadError";
    this.code = code;
  }
}

type CloudinaryErrorLike = {
  http_code?: number;
  message?: string;
  error?: { message?: string };
};

function describeCloudinaryError(error: unknown): {
  http_code?: number;
  message: string;
} {
  if (error && typeof error === "object") {
    const candidate = error as CloudinaryErrorLike;
    return {
      http_code: candidate.http_code,
      message: candidate.message ?? candidate.error?.message ?? "Unknown Cloudinary error",
    };
  }
  return { message: "Unknown Cloudinary error" };
}

/**
 * Server-side Cloudinary adapter: uploads an image buffer to the configured
 * account and normalizes the response into the application's UploadedAsset
 * type. Credentials never leave the server.
 */
export async function uploadImageAsset(
  input: UploadImageInput,
): Promise<UploadedAsset> {
  const config = getCloudinaryConfig();
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  const dataUri = `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`;

  let result: UploadApiResponse;
  try {
    result = (await cloudinary.uploader.upload(dataUri, {
      folder: UPLOAD_FOLDER,
      resource_type: "image",
    })) as UploadApiResponse;
  } catch (error) {
    const described = describeCloudinaryError(error);
    const safeMessage = described.message.split(config.apiSecret).join("[redacted]");
    if (described.http_code === 401 || described.http_code === 403) {
      throw new CloudinaryUploadError(
        "UNAUTHORIZED",
        "Cloudinary rejected the configured credentials. Check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.",
      );
    }
    throw new CloudinaryUploadError(
      "UPLOAD_FAILED",
      `Cloudinary upload failed: ${safeMessage}`,
    );
  }

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    url: result.url,
    format: result.format,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    resourceType: result.resource_type,
    createdAt: result.created_at,
    originalName: input.originalName,
  };
}

import { v2 as cloudinary } from "cloudinary";
import { encodeQrPng, qrPublicId } from "@/lib/qr/qr";

/**
 * Provera — QR image asset for the verification artifact (Phase 6).
 *
 * The QR code is generated in `src/lib/qr/qr.ts` and uploaded to Cloudinary so
 * the artifact transformation can composite it with `l_provera:qr-<recordId>`.
 * A Cloudinary-hosted QR is used (instead of pointing at an application endpoint)
 * because Cloudinary must be able to fetch a remote layer while rendering — an
 * application URL that is only reachable from a laptop cannot be composited.
 *
 * The public ID is derived from the record ID, so re-running the upload replaces
 * the same asset instead of accumulating copies. That also keeps the artifact
 * URL, and therefore its delivery signature, stable for a given destination.
 */

export class QrAssetError extends Error {
  readonly code = "ARTIFACT_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "QrAssetError";
  }
}

export type QrAsset = {
  publicId: string;
  /** Public delivery URL of the QR image. */
  url: string;
  /** Version returned by Cloudinary for this upload. */
  version: number;
  /** URL the QR code encodes. */
  destination: string;
  /** Pixel size of the generated PNG. */
  size: number;
  moduleCount: number;
};

/**
 * Generates the QR for a verification URL and stores it as a Cloudinary image
 * asset so it can be overlaid onto the artifact.
 */
export async function ensureQrAsset(input: {
  recordId: string;
  destination: string;
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}): Promise<QrAsset> {
  const publicId = qrPublicId(input.recordId);
  const qr = encodeQrPng(input.destination);

  cloudinary.config({
    cloud_name: input.cloudName,
    api_key: input.apiKey,
    api_secret: input.apiSecret,
    secure: true,
  });

  let uploaded: { public_id: string; secure_url: string; version: number };
  try {
    uploaded = await cloudinary.uploader.upload(
      `data:image/png;base64,${qr.png.toString("base64")}`,
      {
        public_id: publicId,
        overwrite: true,
        resource_type: "image",
        type: "upload",
        tags: ["provera", "verification-qr"],
        context: `record_id=${input.recordId}|destination=${input.destination}`,
      },
    );
  } catch (error) {
    const described = error as { message?: string; error?: { message?: string } };
    const message = (described?.message ?? described?.error?.message ?? "unknown error")
      .split(input.apiSecret)
      .join("[redacted]");
    throw new QrAssetError(
      `Could not store the verification QR code for ${input.recordId}: ${message}`,
    );
  }

  return {
    publicId: uploaded.public_id,
    url: uploaded.secure_url,
    version: uploaded.version,
    destination: input.destination,
    size: qr.size,
    moduleCount: qr.moduleCount,
  };
}
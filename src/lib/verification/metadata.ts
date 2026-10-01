import { v2 as cloudinary } from "cloudinary";
import { getCloudinaryConfig } from "../cloudinary/config";
import { describeCloudinaryError } from "../cloudinary/upload";
import type { VerificationRecord } from "./record";

/**
 * Provera — attaches verification metadata to the Cloudinary asset (Phase4).
 *
 * Uses the seven structured metadata fields created in the project account
 * (see docs/VERIFICATION_MODEL.md): provera_status, provera_score,
 * provera_record_id, provera_record_hash, provera_timestamp, provera_version
 * (mirrors the scoring-engine version) and provera_flags. The fields exist;
 * this module only writes values. Failures are surfaced to the caller, which
 * must not report a completed verification record (docs/ARCHITECTURE.md).
 */

export class MetadataAttachError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetadataAttachError";
  }
}

export function metadataValuesForRecord(
  record: VerificationRecord,
): Record<string, string | number> {
  return {
    provera_status: record.status,
    provera_score: record.score,
    provera_record_id: record.recordId,
    provera_record_hash: record.recordHash,
    provera_timestamp: record.timestamp,
    provera_version: record.engineVersion,
    provera_flags: record.flags.join(","),
  };
}

/** Writes the record's verification metadata onto its Cloudinary asset. */
export async function attachVerificationMetadata(
  record: VerificationRecord,
): Promise<void> {
  const config = getCloudinaryConfig();
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  try {
    await cloudinary.uploader.update_metadata(
      metadataValuesForRecord(record),
      [record.asset.publicId],
    );
  } catch (error) {
    const message = describeCloudinaryError(error).message
      .split(config.apiSecret)
      .join("[redacted]");
    throw new MetadataAttachError(
      `Could not attach verification metadata to ${record.asset.publicId}: ${message}`,
    );
  }
}

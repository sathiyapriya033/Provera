import { v2 as cloudinary } from "cloudinary";
import {
  artifactInputFromRecord,
  buildVerificationArtifact,
  probeArtifactDelivery,
} from "@/lib/cloudinary/artifact";
import { getCloudinaryConfig, type CloudinaryConfig } from "@/lib/cloudinary/config";
import { ensureQrAsset, type QrAsset } from "@/lib/cloudinary/qr";
import { describeCloudinaryError } from "@/lib/cloudinary/upload";
import { getAppUrl } from "@/lib/app-url";
import { verificationPageUrl } from "@/lib/qr/qr";
import { verifyRecordIntegrity } from "@/lib/verification/record";
import { metadataValuesForRecord } from "@/lib/verification/metadata";
import { getRecord } from "@/lib/verification/store";
import {
  buildInspectionReport,
  type ArtifactInspection,
  type InspectionReport,
  type LiveAssetFields,
  type LiveAssetRead,
  type QrLiveRead,
  type RawDerivedAsset,
} from "./inspect";

/**
 * Provera — Inspector Mode data collection (Phase 7).
 *
 * Gathers the live Cloudinary state for a stored record and hands it to the pure
 * report builder in `inspect.ts`. Every step is allowed to fail on its own and is
 * reported as unavailable: an inspection that cannot read the asset, cannot
 * generate the QR or cannot render the artifact still shows the record, the
 * metadata comparison and the reason for each gap. It never fills a gap with a
 * guess, and it never reports a section as verified when the call behind it
 * failed.
 *
 * Response shapes were read from this account rather than assumed; see
 * `docs/CLOUDINARY.md` for the measured Admin API fields.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Cloudinary returns context as `{ custom: { key: value } }`. */
function readContext(value: unknown): Record<string, string> | null {
  if (!isPlainObject(value)) return null;
  const custom = value.custom;
  if (!isPlainObject(custom)) return null;
  const entries: Record<string, string> = {};
  for (const [key, item] of Object.entries(custom)) {
    if (typeof item === "string") entries[key] = item;
  }
  return Object.keys(entries).length > 0 ? entries : null;
}

/** The Cloudinary error carries `{ error: { message, http_code } }`. */
function describeApiFailure(error: unknown): { httpStatus: number | null; reason: string } {
  const shaped = error as { error?: { message?: unknown; http_code?: unknown } };
  const message =
    typeof shaped?.error?.message === "string"
      ? shaped.error.message
      : describeCloudinaryError(error).message;
  const httpStatus = asNumber(shaped?.error?.http_code);
  return { httpStatus, reason: message.trim() };
}

/** Admin API `resource` options. The SDK's overloads make the parameter type
 * unreliable, so the option bag is declared explicitly instead of inferred. */
type ResourceOptions = Record<string, unknown>;

function resourceOptions(): ResourceOptions {
  return {
    resource_type: "image",
    type: "upload",
    metadata: true,
    context: true,
    tags: true,
    colors: true,
    exif: true,
    phash: true,
  };
}

function toLiveFields(resource: Record<string, unknown>): LiveAssetFields {
  const predominant = isPlainObject(resource.predominant)
    ? resource.predominant.google
    : undefined;
  const colors = Array.isArray(predominant)
    ? predominant
        .map((entry) =>
          Array.isArray(entry) && typeof entry[0] === "string"
            ? { name: entry[0], percent: asNumber(entry[1]) ?? 0 }
            : null,
        )
        .filter((entry): entry is { name: string; percent: number } => entry !== null)
    : [];
  const exif = isPlainObject(resource.exif) ? resource.exif : {};
  const imageMetadata = isPlainObject(resource.image_metadata)
    ? resource.image_metadata
    : {};
  const lastUpdated = isPlainObject(resource.last_updated)
    ? resource.last_updated
    : {};
  const limit = asNumber(resource.rate_limit_allowed);
  const remaining = asNumber(resource.rate_limit_remaining);

  return {
    assetId: asString(resource.asset_id),
    publicId: asString(resource.public_id),
    resourceType: asString(resource.resource_type),
    deliveryType: asString(resource.type),
    format: asString(resource.format),
    version: asNumber(resource.version),
    bytes: asNumber(resource.bytes),
    width: asNumber(resource.width),
    height: asNumber(resource.height),
    createdAt: asString(resource.created_at),
    lastUpdated:
      asString(lastUpdated.updated_at) ?? asString(lastUpdated.metadata_updated_at),
    secureUrl: asString(resource.secure_url),
    accessMode: asString(resource.access_mode),
    predominantColors: colors,
    phash: asString(resource.phash),
    exifFieldCount: Object.keys(exif).length,
    hasExif: Object.keys(exif).length > 0,
    imageMetadataKeys: Object.keys(imageMetadata).sort(),
    tags: asStringArray(resource.tags).sort(),
    context: readContext(resource.context),
    rateLimit:
      limit === null && remaining === null ? null : { limit, remaining },
  };
}

type ResourceRead = {
  live: LiveAssetRead;
  liveMetadata: Record<string, unknown> | null;
  derived: RawDerivedAsset[];
};

async function readAsset(publicId: string): Promise<ResourceRead> {
  try {
    const resource = (await cloudinary.api.resource(
      publicId,
      resourceOptions(),
    )) as unknown;
    if (!isPlainObject(resource)) {
      return {
        live: {
          available: false,
          httpStatus: null,
          reason: "Cloudinary returned a resource response that was not an object.",
        },
        liveMetadata: null,
        derived: [],
      };
    }
    return {
      live: { available: true, fields: toLiveFields(resource) },
      liveMetadata: isPlainObject(resource.metadata) ? resource.metadata : null,
      derived: Array.isArray(resource.derived)
        ? (resource.derived as RawDerivedAsset[])
        : [],
    };
  } catch (error) {
    const { httpStatus, reason } = describeApiFailure(error);
    return {
      live: { available: false, httpStatus, reason },
      liveMetadata: null,
      derived: [],
    };
  }
}

async function readQrAsset(qr: QrAsset): Promise<QrLiveRead> {
  try {
    const resource = (await cloudinary.api.resource(
      qr.publicId,
      resourceOptions(),
    )) as unknown;
    if (!isPlainObject(resource)) {
      return { available: false, reason: "Cloudinary returned an unreadable QR asset." };
    }
    return {
      available: true,
      publicId: asString(resource.public_id) ?? qr.publicId,
      bytes: asNumber(resource.bytes),
      width: asNumber(resource.width),
      height: asNumber(resource.height),
      format: asString(resource.format),
      tags: asStringArray(resource.tags).sort(),
      context: readContext(resource.context),
    };
  } catch (error) {
    return { available: false, reason: describeApiFailure(error).reason };
  }
}

async function inspectArtifact(
  recordId: string,
  record: Parameters<typeof artifactInputFromRecord>[0],
  qrPublicId: string | undefined,
  destination: string,
  credentials: CloudinaryConfig,
): Promise<ArtifactInspection> {
  try {
    const artifact = buildVerificationArtifact(
      artifactInputFromRecord(record, {
        verificationUrl: destination,
        ...(qrPublicId ? { qrPublicId } : {}),
      }),
      credentials,
    );
    const delivery = await probeArtifactDelivery(artifact.url);
    if (!delivery.verified) {
      return {
        status: "unavailable",
        reason: `Cloudinary did not serve an image for the artifact of ${recordId} (HTTP ${delivery.status ?? "no response"}).`,
      };
    }
    return { status: "verified", artifact, delivery };
  } catch (error) {
    return {
      status: "unavailable",
      reason:
        error instanceof Error
          ? error.message
          : "The artifact could not be generated for an unknown reason.",
    };
  }
}

/**
 * Builds the complete Inspector Mode report for a stored record.
 *
 * Throws only for problems that make an inspection impossible — a missing record
 * or missing Cloudinary credentials. Everything else is reported inside the
 * report as an unavailable section with its reason.
 */
export async function collectInspection(
  recordId: string,
): Promise<InspectionReport> {
  const record = await getRecord(recordId);
  const credentials = getCloudinaryConfig();
  cloudinary.config({
    cloud_name: credentials.cloudName,
    api_key: credentials.apiKey,
    api_secret: credentials.apiSecret,
    secure: true,
  });

  const asset = await readAsset(record.asset.publicId);

  const destination = verificationPageUrl(getAppUrl(), record.recordId);
  let qrAsset: QrAsset | null = null;
  let qrFailure: string | null = null;
  try {
    qrAsset = await ensureQrAsset({
      recordId: record.recordId,
      destination,
      ...credentials,
    });
  } catch (error) {
    qrFailure =
      error instanceof Error
        ? error.message
        : "The verification QR code could not be stored.";
  }

  const artifact = await inspectArtifact(
    record.recordId,
    record,
    qrAsset?.publicId,
    destination,
    credentials,
  );

  return buildInspectionReport({
    record,
    integrityVerified: verifyRecordIntegrity(record),
    expectedMetadata: metadataValuesForRecord(record),
    live: asset.live,
    liveMetadata: asset.liveMetadata,
    qr: {
      asset: qrAsset,
      failure: qrFailure,
      live: qrAsset ? await readQrAsset(qrAsset) : null,
    },
    artifact,
    derived: asset.derived,
    generatedAt: new Date().toISOString(),
  });
}

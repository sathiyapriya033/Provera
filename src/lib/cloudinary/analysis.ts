import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import type {
  AnalysisContentTag,
  AnalysisFingerprintValue,
  AnalysisMediaQualityValue,
  AnalysisMetadataValue,
  AnalysisOcrValue,
  AnalysisSignal,
  AnalysisSignalKey,
  AnalysisVisualValue,
  NormalizedAnalysis,
} from "@/types";
import { getCloudinaryConfig, type CloudinaryConfig } from "./config";
import { describeCloudinaryError } from "./upload";

/**
 * Server-side Cloudinary analysis adapter (Phase 2).
 *
 * Runs the analysis capabilities that are available on the configured account
 * and normalizes the results into the application's signal model. Capabilities
 * the account does not expose are reported as `unavailable` with the actual
 * server-provided reason — never as fabricated signal values.
 *
 * Capability verification for this account is documented in
 * docs/ANALYSIS_CAPABILITIES.md.
 */

/** Version identifier of this analysis capability set. */
export const ANALYSIS_WORKFLOW = "cloudinary-asset-analysis@1";

const ANALYZE_API_BASE = "https://api.cloudinary.com/v2/analysis";

export class CloudinaryAnalysisError extends Error {
  readonly code: "ANALYSIS_FAILED" | "ANALYSIS_UNAVAILABLE";
  readonly httpStatus: number;

  constructor(
    code: "ANALYSIS_FAILED" | "ANALYSIS_UNAVAILABLE",
    message: string,
    httpStatus: number,
  ) {
    super(message);
    this.name = "CloudinaryAnalysisError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const SIGNAL_LABELS: Record<AnalysisSignalKey, string> = {
  metadata: "Metadata availability",
  ocr: "OCR",
  visual: "Visual / content",
  fingerprint: "Duplicate / fingerprint",
  mediaQuality: "Media quality",
};

/** Loose view of the Admin API `resource` response fields Provera consumes. */
type CloudinaryResourceInfo = {
  asset_id?: string;
  public_id?: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  created_at?: string;
  original_filename?: string;
  etag?: string;
  exif?: unknown;
  image_metadata?: unknown;
  colors?: unknown;
  predominant?: unknown;
  faces?: unknown;
  phash?: string;
  illustration_score?: number;
  grayscale?: boolean;
  semi_transparent?: boolean;
  [key: string]: unknown;
};

/** Loose view of the Upload API `explicit` response fields Provera consumes. */
type CloudinaryExplicitInfo = {
  quality_analysis?: { focus?: number };
  ocr?: {
    adv_ocr?: {
      status?: string;
      data?: Array<{
        textAnnotations?: Array<{ description?: string; locale?: string }>;
      }>;
    };
  };
  [key: string]: unknown;
};

type ContentTagAttempt = {
  tags: AnalysisContentTag[] | null;
  reason: string | null;
  raw: unknown;
};

type QualityOcrResult = {
  mediaQuality: AnalysisSignal<AnalysisMediaQualityValue>;
  ocr: AnalysisSignal<AnalysisOcrValue>;
  raw: Record<string, unknown>;
};

/**
 * Reads the asset's stored analysis data from the Admin API.
 * Throws CloudinaryAnalysisError when the asset cannot be read at all.
 */
async function fetchResourceInfo(
  publicId: string,
  config: CloudinaryConfig,
): Promise<CloudinaryResourceInfo> {
  try {
    return (await cloudinary.api.resource(publicId, {
      exif: true,
      colors: true,
      faces: true,
      phash: true,
      image_metadata: true,
    })) as CloudinaryResourceInfo;
  } catch (error) {
    const described = describeCloudinaryError(error);
    const message = redact(described.message, config);
    if (described.http_code === 404 || /^Resource not found/i.test(message)) {
      throw new CloudinaryAnalysisError(
        "ANALYSIS_FAILED",
        `Asset "${publicId}" was not found in the Cloudinary account.`,
        404,
      );
    }
    if (described.http_code === 401 || described.http_code === 403) {
      throw new CloudinaryAnalysisError(
        "ANALYSIS_UNAVAILABLE",
        "Cloudinary rejected the configured credentials while reading the asset.",
        503,
      );
    }
    throw new CloudinaryAnalysisError(
      "ANALYSIS_FAILED",
      `Failed to read asset information from Cloudinary: ${message}`,
      502,
    );
  }
}

/**
 * Runs the Upload API analysis pass (quality analysis + OCR request).
 * Never throws: failures are reported through the returned signal statuses.
 */
async function runQualityAndOcr(
  publicId: string,
  config: CloudinaryConfig,
): Promise<QualityOcrResult> {
  try {
    const info = (await cloudinary.uploader.explicit(publicId, {
      type: "upload",
      quality_analysis: true,
      ocr: "adv_ocr",
    })) as CloudinaryExplicitInfo;

    const focus =
      typeof info.quality_analysis?.focus === "number"
        ? info.quality_analysis.focus
        : null;
    const mediaQuality: AnalysisSignal<AnalysisMediaQualityValue> =
      focus !== null
        ? {
            status: "obtained",
            value: { focus },
            source: "cloudinary.upload.quality_analysis",
          }
        : {
            status: "unavailable",
            value: null,
            source: "cloudinary.upload.quality_analysis",
            reason:
              "Cloudinary returned no quality-analysis result for this asset.",
          };

    const adv = info.ocr?.adv_ocr;
    let ocr: AnalysisSignal<AnalysisOcrValue>;
    if (!adv) {
      ocr = {
        status: "unavailable",
        value: null,
        source: "cloudinary.upload.ocr",
        reason:
          "OCR was requested (ocr=adv_ocr) but Cloudinary returned no OCR output. The OCR add-on is not enabled for this account, or no text was detected. See docs/ANALYSIS_CAPABILITIES.md.",
      };
    } else {
      const status = adv.status ?? "unknown";
      if (status !== "complete" && status !== "unknown") {
        ocr = {
          status: "error",
          value: null,
          source: "cloudinary.upload.ocr",
          reason: `Cloudinary reported OCR status "${status}".`,
        };
      } else {
        const annotation = adv.data?.[0]?.textAnnotations?.[0];
        ocr = {
          status: "obtained",
          value: {
            engine: "adv_ocr",
            status,
            text: annotation?.description ?? "",
            locale: annotation?.locale ?? null,
          },
          source: "cloudinary.upload.ocr",
        };
      }
    }

    return {
      mediaQuality,
      ocr,
      raw: pick(info, [
        "quality_analysis",
        "ocr",
        "illustration_score",
        "grayscale",
        "semi_transparent",
      ]),
    };
  } catch (error) {
    const message = redact(describeCloudinaryError(error).message, config);
    const reason = `Cloudinary explicit analysis call failed: ${message}`;
    return {
      mediaQuality: {
        status: "error",
        value: null,
        source: "cloudinary.upload.quality_analysis",
        reason,
      },
      ocr: {
        status: "error",
        value: null,
        source: "cloudinary.upload.ocr",
        reason,
      },
      raw: { error: message },
    };
  }
}

/**
 * Attempts AI content tagging through the Cloudinary Analyze API
 * (google_tagging). When the account has no subscription for the feature the
 * API returns a definitive 403, which is recorded as an explicit limitation.
 * Never throws.
 */
async function runContentTagging(
  assetId: string | null,
  config: CloudinaryConfig,
): Promise<ContentTagAttempt> {
  if (!assetId) {
    return {
      tags: null,
      reason: "Asset ID was unavailable, so content tagging was not attempted.",
      raw: null,
    };
  }
  try {
    const response = await fetch(
      `${ANALYZE_API_BASE}/${config.cloudName}/analyze/google_tagging`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: basicAuth(config),
        },
        body: JSON.stringify({ source: { asset_id: assetId } }),
      },
    );
    const text = await response.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }

    if (response.ok) {
      const analysis = (body as { data?: { analysis?: unknown } })?.data
        ?.analysis;
      const labelAnnotations =
        isRecord(analysis) && isRecord(analysis.label_annotations)
          ? analysis.label_annotations
          : null;
      const labels = Array.isArray(labelAnnotations?.labels)
        ? labelAnnotations.labels
        : [];
      const tags: AnalysisContentTag[] = labels
        .filter(
          (item): item is { label: string; score: number } =>
            isRecord(item) &&
            typeof item.label === "string" &&
            typeof item.score === "number",
        )
        .map((item) => ({ label: item.label, score: item.score }));
      return { tags, reason: null, raw: body };
    }

    const errorBody = isRecord(body)
      ? (body as {
          error?: { message?: string; details?: { feature_name?: string } };
        })
      : null;
    const serverMessage =
      errorBody?.error?.message ?? `HTTP ${response.status}`;
    const feature = errorBody?.error?.details?.feature_name;
    const featureNote = feature ? ` (feature: ${feature})` : "";
    const reason = redact(
      response.status === 403
        ? `Content tagging is not available for this Cloudinary account: ${serverMessage}${featureNote}.`
        : `Cloudinary Analyze API returned HTTP ${response.status}: ${serverMessage}.`,
      config,
    );
    return { tags: null, reason, raw: body ?? { status: response.status } };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return {
      tags: null,
      reason: `Cloudinary Analyze API request failed: ${detail}`,
      raw: null,
    };
  }
}

function normalizeMetadataSignal(
  resource: CloudinaryResourceInfo,
): AnalysisSignal<AnalysisMetadataValue> {
  const imageMetadata = isRecord(resource.image_metadata)
    ? resource.image_metadata
    : {};
  const exif = isRecord(resource.exif) ? resource.exif : {};
  const exifKeys = Object.keys(exif);
  return {
    status: "obtained",
    source: "cloudinary.admin.resource",
    value: {
      imageMetadataKeys: Object.keys(imageMetadata),
      exifFieldCount: exifKeys.length,
      hasExif: exifKeys.length > 0,
      createdAt:
        typeof resource.created_at === "string" ? resource.created_at : null,
      originalFilename:
        typeof resource.original_filename === "string"
          ? resource.original_filename
          : null,
      etag: typeof resource.etag === "string" ? resource.etag : null,
    },
  };
}

function normalizeVisualSignal(
  resource: CloudinaryResourceInfo,
  tagAttempt: ContentTagAttempt,
): AnalysisSignal<AnalysisVisualValue> {
  const predominant = isRecord(resource.predominant)
    ? resource.predominant
    : {};
  const cloudinaryPalette = Array.isArray(predominant.cloudinary)
    ? predominant.cloudinary
    : [];
  const predominantColors = cloudinaryPalette
    .filter(
      (item): item is [string, number] =>
        Array.isArray(item) &&
        item.length === 2 &&
        typeof item[0] === "string" &&
        typeof item[1] === "number",
    )
    .map(([name, percent]) => ({ name, percent }));

  const colors = Array.isArray(resource.colors) ? resource.colors : [];
  const topColors = colors
    .filter(
      (item): item is [string, number] =>
        Array.isArray(item) &&
        item.length === 2 &&
        typeof item[0] === "string" &&
        typeof item[1] === "number",
    )
    .slice(0, 8)
    .map(([hex, percent]) => ({ hex, percent }));

  const value: AnalysisVisualValue = {
    predominantColors,
    topColors,
    faceCount: Array.isArray(resource.faces) ? resource.faces.length : 0,
    illustrationScore:
      typeof resource.illustration_score === "number"
        ? resource.illustration_score
        : null,
    grayscale:
      typeof resource.grayscale === "boolean" ? resource.grayscale : null,
    semiTransparent:
      typeof resource.semi_transparent === "boolean"
        ? resource.semi_transparent
        : null,
    contentTags: tagAttempt.tags,
  };
  if (tagAttempt.tags === null && tagAttempt.reason) {
    value.contentTagsReason = tagAttempt.reason;
  }

  return {
    status: "obtained",
    source: "cloudinary.admin.resource+analyze",
    value,
  };
}

function normalizeFingerprintSignal(
  resource: CloudinaryResourceInfo,
): AnalysisSignal<AnalysisFingerprintValue> {
  if (typeof resource.phash === "string" && resource.phash.length > 0) {
    return {
      status: "obtained",
      value: { phash: resource.phash },
      source: "cloudinary.admin.resource",
    };
  }
  return {
    status: "unavailable",
    value: null,
    source: "cloudinary.admin.resource",
    reason: "Cloudinary did not return a perceptual hash for this asset.",
  };
}

/**
 * Runs the configured analysis workflow for an uploaded asset and returns the
 * normalized signal set.
 */
export async function analyzeAsset(input: {
  publicId: string;
  context: string | null;
}): Promise<NormalizedAnalysis> {
  const config = getCloudinaryConfig();
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  const resource = await fetchResourceInfo(input.publicId, config);

  const [qualityOcr, tagAttempt] = await Promise.all([
    runQualityAndOcr(input.publicId, config),
    runContentTagging(
      typeof resource.asset_id === "string" ? resource.asset_id : null,
      config,
    ),
  ]);

  const signals: NormalizedAnalysis["signals"] = {
    metadata: normalizeMetadataSignal(resource),
    ocr: qualityOcr.ocr,
    visual: normalizeVisualSignal(resource, tagAttempt),
    fingerprint: normalizeFingerprintSignal(resource),
    mediaQuality: qualityOcr.mediaQuality,
  };

  const obtainedSignals = (
    Object.entries(signals) as Array<
      [AnalysisSignalKey, AnalysisSignal<unknown>]
    >
  )
    .filter(([, signal]) => signal.status === "obtained")
    .map(([key]) => key);

  const limitations: string[] = [];
  for (const key of Object.keys(signals) as AnalysisSignalKey[]) {
    const signal = signals[key];
    if (signal.status !== "obtained" && signal.reason) {
      limitations.push(`${SIGNAL_LABELS[key]}: ${signal.reason}`);
    }
  }
  const visualValue = signals.visual.value;
  if (
    visualValue &&
    visualValue.contentTags === null &&
    visualValue.contentTagsReason
  ) {
    limitations.push(`AI content tags: ${visualValue.contentTagsReason}`);
  }

  return {
    analysisId: randomUUID(),
    publicId: input.publicId,
    context: input.context,
    workflow: ANALYSIS_WORKFLOW,
    analyzedAt: new Date().toISOString(),
    signals,
    obtainedSignals,
    limitations,
    rawSummary: {
      resource: pick(resource, [
        "asset_id",
        "public_id",
        "format",
        "bytes",
        "width",
        "height",
        "created_at",
        "etag",
        "original_filename",
        "exif",
        "image_metadata",
        "colors",
        "predominant",
        "faces",
        "phash",
        "illustration_score",
        "grayscale",
        "semi_transparent",
      ]),
      explicit: qualityOcr.raw,
      googleTagging: tagAttempt.raw,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redact(message: string, config: CloudinaryConfig): string {
  if (!config.apiSecret) return message;
  return message.split(config.apiSecret).join("[redacted]");
}

function basicAuth(config: CloudinaryConfig): string {
  return `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64")}`;
}

function pick(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source) out[key] = source[key];
  }
  return out;
}

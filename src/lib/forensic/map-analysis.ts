import type { NormalizedAnalysis } from "@/types";
import type {
  EngineSignalStatus,
  ForensicEngineInput,
} from "./engine";

/**
 * Pure mapper: NormalizedAnalysis (Phase2) → ForensicEngineInput (Phase3).
 *
 * Runtime-defensive: the analysis object arrives from the client, so every
 * field is structurally verified and malformed values degrade to explicit
 * unavailable states — never to favorable values.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapStatus(value: unknown): EngineSignalStatus {
  return value === "obtained" || value === "unavailable" || value === "error"
    ? value
    : "unavailable";
}

function mapReason(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function mapSignal(analysis: unknown, key: string): {
  status: EngineSignalStatus;
  value: Record<string, unknown> | null;
  reason: string | null;
} {
  const signals = isRecord(analysis) ? analysis.signals : null;
  const signal = isRecord(signals) ? signals[key] : null;
  if (!isRecord(signal)) {
    return {
      status: "unavailable",
      value: null,
      reason: `Signal "${key}" was missing from the analysis payload.`,
    };
  }
  const status = mapStatus(signal.status);
  const value = isRecord(signal.value) ? signal.value : null;
  const reason =
    typeof signal.reason === "string" && signal.reason.length > 0
      ? signal.reason
      : null;
  return { status, value, reason };
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBooleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function mapAnalysisToEngineInput(
  analysis: NormalizedAnalysis,
  referenceHashes: string[] = [],
): ForensicEngineInput {
  const record: unknown = analysis;

  const metadata = mapSignal(record, "metadata");
  const metadataValue = metadata.value;
  const ocr = mapSignal(record, "ocr");
  const ocrValue = ocr.value;
  const visual = mapSignal(record, "visual");
  const visualValue = visual.value;
  const fingerprint = mapSignal(record, "fingerprint");
  const fingerprintValue = fingerprint.value;
  const mediaQuality = mapSignal(record, "mediaQuality");
  const qualityValue = mediaQuality.value;

  const context = isRecord(record) ? record.context : null;

  return {
    metadata: {
      status: metadata.status,
      imageMetadataFieldCount: Array.isArray(metadataValue?.imageMetadataKeys)
        ? metadataValue.imageMetadataKeys.length
        : 0,
      exifFieldCount: (() => {
        const n = asNumberOrNull(metadataValue?.exifFieldCount);
        return n === null ? 0 : Math.max(0, Math.floor(n));
      })(),
      hasOriginalFilename:
        typeof metadataValue?.originalFilename === "string" &&
        metadataValue.originalFilename.length > 0,
      hasEtag:
        typeof metadataValue?.etag === "string" &&
        metadataValue.etag.length > 0,
      reason: mapReason(metadata.reason, "Metadata signal was not obtained."),
    },
    ocrClaim: {
      status: ocr.status,
      ocrText: ocr.status === "obtained" ? asStringOrNull(ocrValue?.text) : null,
      claim:
        typeof context === "string" && context.trim().length > 0
          ? context.trim()
          : null,
      reason: mapReason(ocr.reason, "OCR signal was not obtained."),
    },
    visualContent: {
      status: visual.status,
      illustrationScore: asNumberOrNull(visualValue?.illustrationScore),
      isGrayscale: asBooleanOrNull(visualValue?.grayscale),
      isSemiTransparent: asBooleanOrNull(visualValue?.semiTransparent),
      reason: mapReason(visual.reason, "Visual signal was not obtained."),
    },
    duplicate: {
      status: fingerprint.status,
      phash: asStringOrNull(fingerprintValue?.phash),
      referenceHashes,
      reason: mapReason(
        fingerprint.reason,
        "Fingerprint signal was not obtained.",
      ),
    },
    mediaQuality: {
      status: mediaQuality.status,
      focus: asNumberOrNull(qualityValue?.focus),
      reason: mapReason(
        mediaQuality.reason,
        "Media-quality signal was not obtained.",
      ),
    },
  };
}

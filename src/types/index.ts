export type UploadedAsset = {
  publicId: string;
  secureUrl: string;
  url: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  resourceType: string;
  createdAt: string;
  originalName: string;
};

export type ApiErrorCode =
  | "INVALID_INPUT"
  | "UPLOAD_FAILED"
  | "ANALYSIS_FAILED"
  | "ANALYSIS_UNAVAILABLE"
  | "VERIFICATION_FAILED"
  | "METADATA_UPDATE_FAILED"
  | "ARTIFACT_FAILED"
  | "RECORD_NOT_FOUND"
  | "UNAUTHORIZED"
  | "INTERNAL_ERROR";

export type ApiSuccess<T> = { ok: true; data: T };

export type ApiFailure = {
  ok: false;
  error: { code: ApiErrorCode; message: string };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/**
 * Phase 2 — normalized analysis signals.
 *
 * Every signal carries an explicit status so unavailable capabilities are
 * reported as unavailable instead of being presented as real analysis.
 */
export type AnalysisSignalStatus = "obtained" | "unavailable" | "error";

export type AnalysisSignal<T> = {
  status: AnalysisSignalStatus;
  value: T | null;
  /** Which Cloudinary capability produced this signal (e.g. "cloudinary.admin.resource"). */
  source: string;
  /** Why the signal is unavailable or failed. Absent when status is "obtained". */
  reason?: string;
};

export type AnalysisMetadataValue = {
  /** Names of the image metadata (IPTC/XMP/JFIF) fields returned by Cloudinary. */
  imageMetadataKeys: string[];
  exifFieldCount: number;
  hasExif: boolean;
  createdAt: string | null;
  originalFilename: string | null;
  etag: string | null;
};

export type AnalysisOcrValue = {
  engine: string;
  status: string;
  /** Full detected text, exactly as returned by Cloudinary's OCR engine. */
  text: string;
  locale: string | null;
};

export type AnalysisContentTag = { label: string; score: number };

export type AnalysisVisualValue = {
  /** Predominant colors with share percentage, as reported by Cloudinary. */
  predominantColors: { name: string; percent: number }[];
  topColors: { hex: string; percent: number }[];
  faceCount: number;
  illustrationScore: number | null;
  grayscale: boolean | null;
  semiTransparent: boolean | null;
  /** AI content tags, or null when content tagging is unavailable. */
  contentTags: AnalysisContentTag[] | null;
  /** Why content tags could not be obtained. Absent when tags were obtained. */
  contentTagsReason?: string;
};

export type AnalysisFingerprintValue = {
  /** Cloudinary perceptual hash (pHash) of the asset. */
  phash: string;
};

export type AnalysisMediaQualityValue = {
  /** Cloudinary quality-analysis focus score in the 0–1 range. */
  focus: number;
};

export type AnalysisSignalKey =
  | "metadata"
  | "ocr"
  | "visual"
  | "fingerprint"
  | "mediaQuality";

export type NormalizedAnalysis = {
  /** Identifier of this analysis operation (not a verification record). */
  analysisId: string;
  publicId: string;
  /** Optional user-supplied claim/context. Not evaluated in Phase 2. */
  context: string | null;
  /** Version identifier of the analysis workflow/capability set used. */
  workflow: string;
  /** ISO-8601 timestamp of when the analysis ran. */
  analyzedAt: string;
  signals: {
    metadata: AnalysisSignal<AnalysisMetadataValue>;
    ocr: AnalysisSignal<AnalysisOcrValue>;
    visual: AnalysisSignal<AnalysisVisualValue>;
    fingerprint: AnalysisSignal<AnalysisFingerprintValue>;
    mediaQuality: AnalysisSignal<AnalysisMediaQualityValue>;
  };
  /** The signal keys that were actually obtained in this run. */
  obtainedSignals: AnalysisSignalKey[];
  /** Documented capability limitations observed during this run. */
  limitations: string[];
  /** Raw provider payloads kept for Inspector Mode in a later phase. */
  rawSummary: Record<string, unknown>;
};

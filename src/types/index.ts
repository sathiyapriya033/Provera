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

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export const MIME_TYPE_LABELS: Record<AllowedImageMimeType, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/gif": "GIF",
  "image/webp": "WebP",
};

export type ImageFileMetadata = {
  name: string;
  type: string;
  size: number;
};

export type ImageValidationResult =
  | { ok: true; mimeType: AllowedImageMimeType }
  | { ok: false; message: string };

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateImageFile(
  meta: ImageFileMetadata,
): ImageValidationResult {
  if (!meta.name) {
    return { ok: false, message: "Select an image file first." };
  }
  if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(meta.type)) {
    const detail = meta.type ? ` "${meta.type}"` : "";
    const allowed = Object.values(MIME_TYPE_LABELS).join(", ");
    return {
      ok: false,
      message: `Unsupported file type${detail}. Allowed types: ${allowed}.`,
    };
  }
  if (meta.size === 0) {
    return { ok: false, message: "The selected file is empty." };
  }
  if (meta.size > MAX_IMAGE_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `File exceeds the ${formatBytes(MAX_IMAGE_UPLOAD_BYTES)} upload limit (received ${formatBytes(meta.size)}).`,
    };
  }
  return { ok: true, mimeType: meta.type as AllowedImageMimeType };
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function detectImageMimeType(
  bytes: Uint8Array,
): AllowedImageMimeType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}

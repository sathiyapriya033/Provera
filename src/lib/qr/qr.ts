import { deflateSync } from "node:zlib";
import qrcode from "qrcode-generator";

/**
 * Provera — verification QR codes (Phase 6).
 *
 * A QR code is generated for exactly one thing: the URL of the public
 * verification page for a record, `{appUrl}/verify/{recordId}`. Anyone who scans
 * it lands on a page that shows what Provera recorded and assessed — never a
 * claim that the photograph is authentic.
 *
 * The PNG is produced here (rather than by an image library) so the encoding is
 * deterministic and dependency-light: the same destination always yields
 * byte-identical PNG output, which keeps the Cloudinary artifact URL and its
 * signature stable for a record.
 *
 * QR *correctness* is not assumed: `qr.test.ts` decodes the generated PNG with an
 * independent decoder (jsQR) and asserts it resolves to the exact destination URL.
 *
 * This module has no relative runtime imports so it can be unit tested with
 * Node's native TypeScript stripping.
 */

/** Error-correction level: M recovers ~15% and keeps the module count small. */
export const QR_ERROR_CORRECTION = "M" as const;

/** Pixels per QR module. 8px keeps a 33-module code comfortably scannable. */
export const QR_MODULE_SCALE = 8;

/** Quiet zone in modules (4 is the QR specification's minimum). */
export const QR_QUIET_ZONE = 4;

export type QrCode = {
  /** Encoded PNG bytes (8-bit grayscale). */
  png: Buffer;
  /** Pixel size of the square image. */
  size: number;
  /** Number of QR modules per side, excluding the quiet zone. */
  moduleCount: number;
  errorCorrection: typeof QR_ERROR_CORRECTION;
};

/**
 * The public verification page for a record. This single function is the
 * canonical definition of the QR destination: the artifact text, the QR code and
 * the link shown in the UI all come from it.
 */
export function verificationPageUrl(appUrl: string, recordId: string): string {
  const base = appUrl.trim().replace(/\/+$/, "");
  return `${base}/verify/${recordId}`;
}

/**
 * Deterministic Cloudinary public ID for a record's QR image. The name part has
 * no slashes so the overlay stays a single URL path segment (`l_provera:qr-…`).
 */
export function qrPublicId(recordId: string): string {
  return `provera/qr-${recordId}`;
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** Minimal 8-bit grayscale PNG writer (IHDR + IDAT + IEND, filter type 0). */
function encodeGrayscalePng(size: number, gray: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type: grayscale
  const raw = Buffer.alloc(size * (size + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size + 1)] = 0; // filter: none
    gray.copy(raw, y * (size + 1) + 1, y * size, (y + 1) * size);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Encodes `destination` as a QR code PNG: black modules on a white field with
 * the standard quiet zone, so scanners see the required light margin.
 */
export function encodeQrPng(destination: string): QrCode {
  const qr = qrcode(0, QR_ERROR_CORRECTION);
  qr.addData(destination);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const size = (moduleCount + QR_QUIET_ZONE * 2) * QR_MODULE_SCALE;
  const gray = Buffer.alloc(size * size, 0xff);

  for (let row = 0; row < moduleCount; row += 1) {
    for (let column = 0; column < moduleCount; column += 1) {
      if (!qr.isDark(row, column)) continue;
      const top = (row + QR_QUIET_ZONE) * QR_MODULE_SCALE;
      const left = (column + QR_QUIET_ZONE) * QR_MODULE_SCALE;
      for (let dy = 0; dy < QR_MODULE_SCALE; dy += 1) {
        const y = top + dy;
        gray.fill(0x00, y * size + left, y * size + left + QR_MODULE_SCALE);
      }
    }
  }

  return {
    png: encodeGrayscalePng(size, gray),
    size,
    moduleCount,
    errorCorrection: QR_ERROR_CORRECTION,
  };
}
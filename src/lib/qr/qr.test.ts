import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { describe, test } from "node:test";
import jsQR from "jsqr";
import {
  QR_ERROR_CORRECTION,
  QR_MODULE_SCALE,
  QR_QUIET_ZONE,
  encodeQrPng,
  qrPublicId,
  verificationPageUrl,
} from "./qr.ts";

const APP_URL = "http://localhost:3000";
const RECORD_ID = "PV-2026-UHX84W57";
const DESTINATION = `${APP_URL}/verify/${RECORD_ID}`;

/**
 * Independent PNG reader for the encoder's own output: 8-bit grayscale, filter
 * type 0 only. Deliberately written separately from the encoder so a bug in the
 * encoder cannot silently agree with the decoder.
 */
function readGrayscalePng(buffer: Buffer): { width: number; height: number; rgba: Uint8ClampedArray } {
  assert.deepEqual(
    [...buffer.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "PNG signature",
  );
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  const chunks: string[] = [];
  const idat: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push(type);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    }
    if (type === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  assert.equal(bitDepth, 8);
  assert.equal(colorType, 0);
  assert.deepEqual(chunks, ["IHDR", "IDAT", "IEND"]);

  const raw = inflateSync(Buffer.concat(idat));
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    assert.equal(raw[y * (width + 1)], 0, "scanline filter must be none");
    for (let x = 0; x < width; x += 1) {
      const value = raw[y * (width + 1) + 1 + x];
      const i = y * width + x;
      rgba[i * 4] = value;
      rgba[i * 4 + 1] = value;
      rgba[i * 4 + 2] = value;
      rgba[i * 4 + 3] = 255;
    }
  }
  return { width, height, rgba };
}

function decodeQr(buffer: Buffer): string | undefined {
  const { width, height, rgba } = readGrayscalePng(buffer);
  return jsQR(rgba, width, height)?.data;
}

describe("verification destination", () => {
  test("builds the public verification page URL", () => {
    assert.equal(
      verificationPageUrl(APP_URL, RECORD_ID),
      "http://localhost:3000/verify/PV-2026-UHX84W57",
    );
  });

  test("normalizes trailing slashes and whitespace", () => {
    assert.equal(
      verificationPageUrl("https://provera.example//", RECORD_ID),
      "https://provera.example/verify/PV-2026-UHX84W57",
    );
    assert.equal(
      verificationPageUrl("  https://provera.example  ", RECORD_ID),
      "https://provera.example/verify/PV-2026-UHX84W57",
    );
  });
});

describe("QR public ID", () => {
  test("is derived from the record ID", () => {
    assert.equal(qrPublicId(RECORD_ID), "provera/qr-PV-2026-UHX84W57");
  });

  test("keeps the asset name free of slashes so overlays stay one path segment", () => {
    const name = qrPublicId(RECORD_ID).split("/")[1];
    assert.equal(name.includes("/"), false);
    assert.equal(name, "qr-PV-2026-UHX84W57");
  });

  test("different records get different QR assets", () => {
    assert.notEqual(qrPublicId("PV-2026-AAAAAAAA"), qrPublicId("PV-2026-BBBBBBBB"));
  });
});

describe("QR encoding", () => {
  test("produces a valid grayscale PNG of the expected size", () => {
    const qr = encodeQrPng(DESTINATION);
    assert.equal(qr.errorCorrection, QR_ERROR_CORRECTION);
    assert.equal(qr.size, (qr.moduleCount + QR_QUIET_ZONE * 2) * QR_MODULE_SCALE);
    assert.equal(qr.size % QR_MODULE_SCALE, 0);
    assert.ok(qr.png.length > 0);
    const image = readGrayscalePng(qr.png);
    assert.equal(image.width, qr.size);
    assert.equal(image.height, qr.size);
  });

  test("is deterministic for the same destination", () => {
    assert.deepEqual(encodeQrPng(DESTINATION).png, encodeQrPng(DESTINATION).png);
  });

  test("decodes back to the exact verification URL", () => {
    assert.equal(decodeQr(encodeQrPng(DESTINATION).png), DESTINATION);
  });

  test("a different destination produces different bytes", () => {
    const first = encodeQrPng(DESTINATION).png;
    const second = encodeQrPng(`${APP_URL}/verify/PV-2026-AAAAAAAA`).png;
    assert.notEqual(Buffer.compare(first, second), 0);
    assert.equal(decodeQr(second), `${APP_URL}/verify/PV-2026-AAAAAAAA`);
  });

  test("paints a white quiet zone so scanners can find the code", () => {
    const qr = encodeQrPng(DESTINATION);
    const { width, height, rgba } = readGrayscalePng(qr.png);
    const at = (x: number, y: number) => rgba[(y * width + x) * 4];
    const margin = QR_QUIET_ZONE * QR_MODULE_SCALE;
    for (let step = 0; step < margin; step += 4) {
      assert.equal(at(step, step), 255, "corner must be white");
      assert.equal(at(width - 1 - step, height - 1 - step), 255);
      assert.equal(at(step, height - 1 - step), 255);
      assert.equal(at(width - 1 - step, step), 255);
    }
    // The first module of the finder pattern is dark.
    assert.equal(at(margin, margin), 0);
  });

  test("round-trips a long production-style URL", () => {
    const long = `https://provera.example/verify/PV-2026-ABCDEFGH?source=artifact`;
    assert.equal(decodeQr(encodeQrPng(long).png), long);
  });
});
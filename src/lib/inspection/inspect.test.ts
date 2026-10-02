import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DERIVATIVE_PREVIEW_LIMIT,
  INSPECTION_SCOPE,
  INSPECTION_VERSION,
  buildInspectionReport,
  compareAssetIdentity,
  compareVerificationMetadata,
  summarizeDerivatives,
  type LiveAssetFields,
} from "./inspect.ts";
import type { VerificationRecord } from "@/lib/verification/record";

const RECORD_ID = "PV-2026-ABCDEFGH";

const RECORD: VerificationRecord = {
  recordId: RECORD_ID,
  schemaVersion: "provera-record@1",
  asset: {
    publicId: "provera/example",
    resourceType: "image",
    format: "jpg",
    version: 1790875061,
    secureUrl:
      "https://res.cloudinary.com/demo/image/upload/v1790875061/provera/example.jpg",
  },
  score: 75,
  status: "REVIEW",
  signals: {
    metadataAvailability: 100,
    ocrConsistency: null,
    visualConsistency: 70,
    duplicateIndicator: null,
    mediaQuality: 60,
  },
  reasons: ["Positive: metadata is present"],
  flags: ["unavailable:ocrClaim"],
  coverage: 55,
  context: "Accident on Main Road",
  analysisId: "11111111-2222-3333-4444-555555555555",
  timestamp: "2026-03-04T05:06:07.000Z",
  engineVersion: "provera-forensic@1",
  recordHash: "a".repeat(64),
};

const EXPECTED_METADATA: Record<string, string | number> = {
  provera_status: "REVIEW",
  provera_score: 75,
  provera_record_id: RECORD_ID,
  provera_record_hash: "a".repeat(64),
  provera_timestamp: "2026-03-04T05:06:07.000Z",
  provera_version: "provera-forensic@1",
  provera_flags: "unavailable:ocrClaim",
};

function liveFields(overrides: Partial<LiveAssetFields> = {}): LiveAssetFields {
  return {
    assetId: "043a426237357c022b9a8edaf92b7f1a",
    publicId: "provera/example",
    resourceType: "image",
    deliveryType: "upload",
    format: "jpg",
    version: 1790875061,
    bytes: 109669,
    width: 864,
    height: 576,
    createdAt: "2026-03-04T05:06:00Z",
    lastUpdated: "2026-03-04T05:06:07Z",
    secureUrl:
      "https://res.cloudinary.com/demo/image/upload/v1790875061/provera/example.jpg",
    accessMode: null,
    predominantColors: [{ name: "green", percent: 48.1 }],
    phash: "c9635a63eacf11c1",
    exifFieldCount: 0,
    hasExif: false,
    imageMetadataKeys: [],
    tags: [],
    context: null,
    rateLimit: { limit: 500, remaining: 498 },
    ...overrides,
  };
}

function derivedWithRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "b5beffe16c948017c0536f5530092b35",
    format: "png",
    bytes: 1146988,
    transformation: `b_rgb:0f172a,c_pad,h_1200,w_1200/l_text:Arial_40_bold:PROVERA/f_auto,q_auto?record=${RECORD_ID}`,
    transformation_signature: "9bdfeb8d-3635-3eb8-9120-0ad7b4118d18",
    secure_url: "https://res.cloudinary.com/demo/image/upload/derived/example.png",
    ...overrides,
  };
}

describe("metadata comparison", () => {
  test("reports a match when every field equals the record", () => {
    const result = compareVerificationMetadata(EXPECTED_METADATA, {
      ...EXPECTED_METADATA,
    });
    assert.equal(result.matches, true);
    assert.equal(result.matchCount, 7);
    assert.equal(result.mismatchCount, 0);
    assert.equal(result.missingCount, 0);
  });

  test("matches a numeric field whether Cloudinary returns a number or a string", () => {
    const numeric = compareVerificationMetadata(EXPECTED_METADATA, {
      ...EXPECTED_METADATA,
      provera_score: 75,
    });
    const text = compareVerificationMetadata(EXPECTED_METADATA, {
      ...EXPECTED_METADATA,
      provera_score: "75",
    });
    assert.equal(numeric.matches, true);
    assert.equal(text.matches, true);
  });

  test("detects an edited field instead of reporting agreement", () => {
    const result = compareVerificationMetadata(EXPECTED_METADATA, {
      ...EXPECTED_METADATA,
      provera_status: "VERIFIED",
    });
    assert.equal(result.matches, false);
    assert.equal(result.mismatchCount, 1);
    const changed = result.fields.find((field) => field.field === "provera_status");
    assert.equal(changed?.state, "mismatch");
    assert.equal(changed?.live, "VERIFIED");
    assert.equal(changed?.expected, "REVIEW");
  });

  test("distinguishes a missing field from a mismatched one", () => {
    const live: Record<string, unknown> = { ...EXPECTED_METADATA };
    delete live.provera_flags;
    const result = compareVerificationMetadata(EXPECTED_METADATA, live);
    assert.equal(result.matches, false);
    assert.equal(result.missingCount, 1);
    assert.equal(result.mismatchCount, 0);
    const missing = result.fields.find((field) => field.field === "provera_flags");
    assert.equal(missing?.state, "missing");
    assert.equal(missing?.live, null);
  });

  test("reports an empty flag list as a matching empty value", () => {
    const expected = { provera_flags: "" };
    const result = compareVerificationMetadata(expected, { provera_flags: "" });
    assert.equal(result.matches, true);
    assert.equal(result.fields[0].state, "match");
  });

  test("lists provera_* fields the record did not write", () => {
    const result = compareVerificationMetadata(EXPECTED_METADATA, {
      ...EXPECTED_METADATA,
      provera_future_field: "x",
      unrelated: "y",
    });
    assert.deepEqual(result.extraLiveFields, ["provera_future_field"]);
    assert.equal(result.matches, true);
  });

  test("a null live payload means every field is missing, not matching", () => {
    const result = compareVerificationMetadata(EXPECTED_METADATA, null);
    assert.equal(result.matches, false);
    assert.equal(result.missingCount, 7);
    assert.equal(result.mismatchCount, 0);
    assert.deepEqual(result.extraLiveFields, []);
  });
});

describe("asset identity comparison", () => {
  test("reports consistency when the live asset matches the record", () => {
    const result = compareAssetIdentity(RECORD.asset, liveFields());
    assert.equal(result.outcome, "consistent");
    assert.deepEqual(result.mismatched, []);
    assert.deepEqual(result.notes, []);
    assert.equal(result.checks.length, 5);
  });

  test("detects a replaced asset through the version", () => {
    const result = compareAssetIdentity(RECORD.asset, liveFields({ version: 1790999999 }));
    assert.equal(result.outcome, "changed");
    assert.deepEqual(result.mismatched, ["version"]);
    assert.equal(result.notes.length, 1);
    assert.match(result.notes[0], /replaced after verification/);
  });

  test("a delivery URL change is reported without claiming tampering", () => {
    const result = compareAssetIdentity(
      RECORD.asset,
      liveFields({ secureUrl: "https://res.cloudinary.com/demo/other/example.jpg" }),
    );
    assert.equal(result.outcome, "changed");
    assert.match(result.notes[0], /not evidence of tampering/);
  });

  test("fields the record never stored are not counted as agreement", () => {
    const result = compareAssetIdentity(
      { publicId: "provera/example", resourceType: "image" },
      liveFields(),
    );
    const format = result.checks.find((check) => check.field === "format");
    const version = result.checks.find((check) => check.field === "version");
    assert.equal(format?.state, "not_compared");
    assert.equal(version?.state, "not_compared");
    assert.equal(result.outcome, "consistent");
  });

  test("no live read means nothing can be compared", () => {
    const result = compareAssetIdentity(RECORD.asset, null);
    assert.equal(result.outcome, "unknown");
    assert.deepEqual(result.mismatched, []);
    assert.ok(result.checks.every((check) => check.state === "not_compared"));
  });
});

describe("derivative summary", () => {
  test("counts only derivatives that carry the record ID", () => {
    const result = summarizeDerivatives(
      [
        derivedWithRecord(),
        { id: "other", format: "jpg", transformation: "c_fill,w_100/other-asset" },
      ],
      RECORD_ID,
    );
    assert.equal(result.total, 2);
    assert.equal(result.matching, 1);
    assert.equal(result.entries[0].format, "png");
    assert.equal(result.entries[0].bytes, 1146988);
  });

  test("counts transformation components including the delivery segment", () => {
    const result = summarizeDerivatives(
      [derivedWithRecord({ transformation: `a_1/b_2/c_3?record=${RECORD_ID}` })],
      RECORD_ID,
    );
    assert.equal(result.entries[0].componentCount, 3);
  });

  test("caps the preview and says so", () => {
    const many = Array.from({ length: DERIVATIVE_PREVIEW_LIMIT + 4 }, (_, index) =>
      derivedWithRecord({ id: `derived-${index}`, bytes: 1000 - index }),
    );
    const result = summarizeDerivatives(many, RECORD_ID);
    assert.equal(result.matching, DERIVATIVE_PREVIEW_LIMIT + 4);
    assert.equal(result.entries.length, DERIVATIVE_PREVIEW_LIMIT);
    assert.equal(result.truncated, true);
    assert.equal(result.entries[0].id, "derived-0");
  });

  test("an empty derivative list is reported honestly", () => {
    const result = summarizeDerivatives([], RECORD_ID);
    assert.deepEqual(result, {
      matching: 0,
      total: 0,
      entries: [],
      truncated: false,
    });
  });

  test("ignores malformed entries instead of throwing", () => {
    const result = summarizeDerivatives(
      [
        { id: 1, bytes: "big", transformation: 42, secure_url: null },
        derivedWithRecord({ transformation_signature: 7, secure_url: 9 }),
      ],
      RECORD_ID,
    );
    assert.equal(result.matching, 1);
    assert.equal(result.entries[0].transformationSignature, null);
    assert.equal(result.entries[0].secureUrl, null);
  });
});

describe("report assembly", () => {
  function report(overrides: Partial<Parameters<typeof buildInspectionReport>[0]> = {}) {
    return buildInspectionReport({
      record: RECORD,
      integrityVerified: true,
      expectedMetadata: EXPECTED_METADATA,
      live: { available: true, fields: liveFields() },
      liveMetadata: { ...EXPECTED_METADATA },
      qr: { asset: null, failure: null, live: null },
      artifact: { status: "unavailable", reason: "not generated" },
      derived: [derivedWithRecord()],
      generatedAt: "2026-03-04T06:00:00.000Z",
      ...overrides,
    });
  }

  test("carries the record facts and the supplied integrity result", () => {
    const built = report();
    assert.equal(built.inspectionVersion, INSPECTION_VERSION);
    assert.equal(built.generatedAt, "2026-03-04T06:00:00.000Z");
    assert.equal(built.record.recordId, RECORD_ID);
    assert.equal(built.record.integrityVerified, true);
    assert.equal(built.record.score, 75);
    assert.equal(built.record.coverage, 55);
    assert.equal(built.scope, INSPECTION_SCOPE);
  });

  test("is deterministic for identical inputs", () => {
    assert.deepEqual(report(), report());
  });

  test("never claims agreement when the live read failed", () => {
    const built = report({
      live: { available: false, httpStatus: 404, reason: "Resource not found" },
      liveMetadata: null,
    });
    assert.equal(built.asset.live.available, false);
    assert.equal(built.asset.identity.outcome, "unknown");
    assert.equal(built.metadata.matches, false);
    assert.equal(built.metadata.missingCount, 7);
  });

  test("keeps an ungenerated artifact out of the report instead of faking one", () => {
    const built = report();
    assert.equal(built.artifact.status, "unavailable");
    assert.equal(
      built.artifact.status === "unavailable" ? built.artifact.reason : null,
      "not generated",
    );
  });
});


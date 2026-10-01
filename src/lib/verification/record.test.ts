import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ENGINE_VERSION,
  calculateConsistencyScore,
  type ForensicEngineInput,
} from "../forensic/engine.ts";
import {
  RECORD_ID_PATTERN,
  RECORD_SCHEMA_VERSION,
  buildVerificationRecord,
  canonicalizeRecord,
  computeRecordHash,
  createRecordId,
  deriveFlags,
  formatReasons,
  verifyRecordIntegrity,
  type RecordAssetInput,
  type VerificationRecord,
} from "./record.ts";

/** Fully-obtained baseline mirroring the Phase3 engine test fixture. */
function baseInput(
  overrides: Partial<ForensicEngineInput> = {},
): ForensicEngineInput {
  const base: ForensicEngineInput = {
    metadata: {
      status: "obtained",
      imageMetadataFieldCount: 6,
      exifFieldCount: 12,
      hasOriginalFilename: true,
      hasEtag: true,
      reason: null,
    },
    ocrClaim: {
      status: "unavailable",
      ocrText: null,
      claim: "A dog in a park",
      reason: "OCR add-on is not enabled for this account.",
    },
    visualContent: {
      status: "obtained",
      illustrationScore: 0,
      isGrayscale: false,
      isSemiTransparent: false,
      reason: null,
    },
    duplicate: {
      status: "unavailable",
      phash: "c9635a63eacf11c1",
      referenceHashes: [],
      reason: "No reference assets were available to compare against.",
    },
    mediaQuality: { status: "obtained", focus: 0.9, reason: null },
  };
  return { ...base, ...overrides };
}

/** Input that yields concerns and unavailable signals (engine FLAGGED case). */
function weakInput(): ForensicEngineInput {
  return baseInput({
    metadata: { ...baseInput().metadata, status: "unavailable", reason: "gone" },
    ocrClaim: {
      status: "obtained",
      ocrText: "nothing relevant at all",
      claim: "Accident on Main Road",
      reason: null,
    },
    visualContent: {
      ...baseInput().visualContent,
      status: "unavailable",
      reason: "gone",
    },
    duplicate: {
      status: "obtained",
      phash: "0000000000000000",
      referenceHashes: ["0000000000000000"],
      reason: null,
    },
    mediaQuality: { status: "obtained", focus: 0.1, reason: null },
  });
}

const FIXED_ID = "PV-2026-ABCDEFGH";
const FIXED_TIME = "2026-03-04T05:06:07.000Z";
const FIXED_ANALYSIS_ID = "11111111-2222-3333-4444-555555555555";

const ASSET: RecordAssetInput = {
  publicId: "provera/sample-image",
  resourceType: "image",
  format: "jpg",
  version: 1790847184,
  secureUrl:
    "https://res.cloudinary.com/demo/image/upload/v1790847184/provera/sample-image.jpg",
};

function buildRecord(
  input: ForensicEngineInput = baseInput(),
  overrides: Partial<RecordAssetInput> = {},
): VerificationRecord {
  return buildVerificationRecord({
    recordId: FIXED_ID,
    asset: { ...ASSET, ...overrides },
    result: calculateConsistencyScore(input),
    context: "Accident on Main Road",
    analysisId: FIXED_ANALYSIS_ID,
    timestamp: FIXED_TIME,
  });
}

describe("record ID", () => {
  test("matches the documented PV-YYYY-XXXXXXXX format", () => {
    const id = createRecordId(new Date("2026-03-04T05:06:07.000Z"));
    assert.match(id, RECORD_ID_PATTERN);
    assert.ok(id.startsWith("PV-2026-"), `unexpected prefix in ${id}`);
    assert.equal(id.length, "PV-2026-".length + 8);
  });

  test("uses the unambiguous alphabet for the random body (never I, O, 0 or 1)", () => {
    for (let index = 0; index < 200; index += 1) {
      const body = createRecordId().split("-")[2];
      assert.equal(body.length, 8);
      assert.doesNotMatch(body, /[IO01]/);
    }
  });

  test("does not repeat across many generations", () => {
    const ids = new Set(
      Array.from({ length: 500 }, () => createRecordId()),
    );
    assert.equal(ids.size, 500);
  });

  test("rejects malformed identifiers", () => {
    assert.equal(RECORD_ID_PATTERN.test("PV-2026-ABCDEFGI"), false); // I excluded
    assert.equal(RECORD_ID_PATTERN.test("PV-2026-ABCDEFGH0"), false); // 0 excluded
    assert.equal(RECORD_ID_PATTERN.test("PV-26-ABCDEFGH"), false);
    assert.equal(RECORD_ID_PATTERN.test("pv-2026-ABCDEFGH"), false);
  });
});

describe("record contents", () => {
  test("carries schema, asset identity, score, status and versions", () => {
    const result = calculateConsistencyScore(baseInput());
    const record = buildRecord();

    assert.equal(RECORD_SCHEMA_VERSION, "provera-record@1");
    assert.equal(record.schemaVersion, RECORD_SCHEMA_VERSION);
    assert.equal(record.recordId, FIXED_ID);
    assert.equal(record.timestamp, FIXED_TIME);
    assert.equal(record.analysisId, FIXED_ANALYSIS_ID);
    assert.equal(record.engineVersion, ENGINE_VERSION);
    assert.equal(record.score, result.score);
    assert.equal(record.status, result.status);
    assert.equal(record.coverage, result.coverage);
    assert.equal(record.context, "Accident on Main Road");
    assert.deepEqual(record.asset, ASSET);
  });

  test("maps engine components onto the documented signal slots", () => {
    const result = calculateConsistencyScore(baseInput());
    const record = buildRecord();
    const byKey = new Map(result.components.map((c) => [c.signal, c]));

    assert.equal(record.signals.metadataAvailability, byKey.get("metadata")?.score);
    assert.equal(record.signals.visualConsistency, byKey.get("visualContent")?.score);
    assert.equal(record.signals.mediaQuality, byKey.get("mediaQuality")?.score);
    // Unavailable components are excluded from scoring → explicit nulls.
    assert.equal(byKey.get("ocrClaim")?.status, "unavailable");
    assert.equal(record.signals.ocrConsistency, null);
    assert.equal(byKey.get("duplicate")?.status, "unavailable");
    assert.equal(record.signals.duplicateIndicator, null);
  });

  test("omits optional asset fields instead of inventing values", () => {
    const record = buildVerificationRecord({
      recordId: FIXED_ID,
      asset: { publicId: "provera/minimal", resourceType: "image" },
      result: calculateConsistencyScore(baseInput()),
      context: null,
      analysisId: null,
      timestamp: FIXED_TIME,
    });
    assert.deepEqual(Object.keys(record.asset).sort(), [
      "publicId",
      "resourceType",
    ]);
    assert.equal(record.context, null);
    assert.equal(record.analysisId, null);
  });

  test("survives a JSON round-trip without undefined fields", () => {
    const record = buildRecord();
    assert.deepEqual(JSON.parse(JSON.stringify(record)), record);
  });

  test("records human-readable reasons with their kind", () => {
    const result = calculateConsistencyScore(weakInput());
    const record = buildRecord(weakInput());
    assert.equal(record.reasons.length, result.reasons.length);
    for (const reason of record.reasons) {
      assert.match(reason, /^(Positive|Concern|Note): /);
    }
    assert.deepEqual(record.reasons, formatReasons(result));
  });
});

describe("machine-readable flags", () => {
  test("marks every unavailable component and every concern signal", () => {
    const record = buildRecord(weakInput());
    assert.ok(record.flags.includes("unavailable:metadata"));
    assert.ok(record.flags.includes("unavailable:visualContent"));
    assert.ok(record.flags.includes("concern:ocrClaim"));
    assert.ok(record.flags.includes("concern:duplicate"));
    assert.ok(!record.flags.some((flag) => flag.includes("coverage")));
  });

  test("a strong result only reports its unavailable signals", () => {
    const result = calculateConsistencyScore(baseInput());
    const record = buildRecord();
    assert.deepEqual(record.flags, ["unavailable:ocrClaim", "unavailable:duplicate"]);
    assert.deepEqual(record.flags, deriveFlags(result));
    assert.deepEqual(result.unavailableSignals.length, 2);
  });
});

describe("canonicalization", () => {
  test("is deterministic for identical inputs", () => {
    const first = buildRecord();
    const second = buildRecord();
    assert.deepEqual(first, second);
    assert.equal(first.recordHash, second.recordHash);
  });

  test("sorts object keys at every level", () => {
    const canonical = canonicalizeRecord(buildRecord()) as Record<string, unknown>;
    const keys = Object.keys(canonical);
    assert.deepEqual(keys, [...keys].sort());
    const signals = canonical.signals as Record<string, unknown>;
    assert.deepEqual(Object.keys(signals), [...Object.keys(signals)].sort());
  });

  test("is independent of insertion order", () => {
    const original = buildRecord();
    const reordered: VerificationRecord = {
      recordHash: original.recordHash,
      engineVersion: original.engineVersion,
      timestamp: original.timestamp,
      analysisId: original.analysisId,
      context: original.context,
      coverage: original.coverage,
      flags: original.flags,
      reasons: original.reasons,
      signals: {
        mediaQuality: original.signals.mediaQuality,
        duplicateIndicator: original.signals.duplicateIndicator,
        visualConsistency: original.signals.visualConsistency,
        ocrConsistency: original.signals.ocrConsistency,
        metadataAvailability: original.signals.metadataAvailability,
      },
      status: original.status,
      score: original.score,
      asset: {
        secureUrl: original.asset.secureUrl,
        version: original.asset.version,
        format: original.asset.format,
        resourceType: original.asset.resourceType,
        publicId: original.asset.publicId,
      },
      schemaVersion: original.schemaVersion,
      recordId: original.recordId,
    };

    assert.equal(
      JSON.stringify(canonicalizeRecord(original)),
      JSON.stringify(canonicalizeRecord(reordered)),
    );
    assert.equal(computeRecordHash(original), computeRecordHash(reordered));
  });

  test("keeps array element order (reasons and flags are ordered data)", () => {
    const record = buildRecord(weakInput());
    const shuffled: VerificationRecord = {
      ...record,
      reasons: [...record.reasons].reverse(),
    };
    assert.notEqual(computeRecordHash(record), computeRecordHash(shuffled));
  });
});

describe("integrity hash", () => {
  test("is a 64-character SHA-256 hex digest", () => {
    const record = buildRecord();
    assert.match(record.recordHash, /^[0-9a-f]{64}$/);
    assert.equal(record.recordHash, computeRecordHash(record));
  });

  test("is reproducible from the canonical record data", () => {
    const record = buildRecord();
    const rebuilt = buildRecord();
    assert.equal(computeRecordHash(rebuilt), record.recordHash);
  });

  test("excludes the recordHash field from its own input", () => {
    const record = buildRecord();
    assert.equal(
      computeRecordHash(record),
      computeRecordHash({ ...record, recordHash: "0".repeat(64) }),
    );
  });

  test("verifies a freshly built record", () => {
    assert.equal(verifyRecordIntegrity(buildRecord()), true);
  });

  test("detects tampering with score, status, or reasons", () => {
    const record = buildRecord();
    assert.equal(
      verifyRecordIntegrity({ ...record, score: record.score + 1 }),
      false,
    );
    assert.equal(
      verifyRecordIntegrity({
        ...record,
        status: record.status === "VERIFIED" ? "FLAGGED" : "VERIFIED",
      }),
      false,
    );
    assert.equal(
      verifyRecordIntegrity({ ...record, reasons: [...record.reasons, "Note: injected"] }),
      false,
    );
    assert.equal(
      verifyRecordIntegrity({
        ...record,
        asset: { ...record.asset, publicId: "provera/other-asset" },
      }),
      false,
    );
  });

  test("rejects a record whose stored hash is missing or malformed", () => {
    const record = buildRecord();
    assert.equal(verifyRecordIntegrity({ ...record, recordHash: "" }), false);
    assert.equal(verifyRecordIntegrity({ ...record, recordHash: "short" }), false);
  });
});

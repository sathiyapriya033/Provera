import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  COMPONENT_ORDER,
  ENGINE_VERSION,
  ENGINE_WEIGHTS,
  calculateConsistencyScore,
  hammingDistanceHex,
  normalizeInput,
  statusForScore,
  tokenize,
  type ForensicEngineInput,
} from "./engine.ts";

/** Fully-obtained baseline with a strong metadata/visual/quality profile. */
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
      status: "obtained",
      phash: "c9635a63eacf11c1",
      referenceHashes: [],
      reason: null,
    },
    mediaQuality: { status: "obtained", focus: 0.9, reason: null },
  };
  return { ...base, ...overrides };
}

describe("engine weights and version", () => {
  test("weights are explicit and sum to100", () => {
    assert.deepEqual(ENGINE_WEIGHTS, {
      metadata: 20,
      ocrClaim: 25,
      visualContent: 25,
      duplicate: 20,
      mediaQuality: 10,
    });
    const total = Object.values(ENGINE_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(total, 100);
  });

  test("component order is fixed and complete", () => {
    assert.deepEqual(COMPONENT_ORDER, [
      "metadata",
      "ocrClaim",
      "visualContent",
      "duplicate",
      "mediaQuality",
    ]);
  });

  test("engine version is reported in every result", () => {
    const result = calculateConsistencyScore(baseInput());
    assert.equal(result.engineVersion, ENGINE_VERSION);
    assert.equal(ENGINE_VERSION, "provera-forensic@1");
  });
});

describe("status thresholds", () => {
  test("boundary values map to the documented statuses", () => {
    assert.equal(statusForScore(0), "FLAGGED");
    assert.equal(statusForScore(49), "FLAGGED");
    assert.equal(statusForScore(50), "REVIEW");
    assert.equal(statusForScore(79), "REVIEW");
    assert.equal(statusForScore(80), "VERIFIED");
    assert.equal(statusForScore(100), "VERIFIED");
  });

  test("score of exactly80 is VERIFIED through the full pipeline", () => {
    // metadata score100 (20 weight) + media-quality score40 (10 weight):
    // (20×100 + 10×40) / 30 = 80.0 → VERIFIED
    const input = baseInput({
      metadata: {
        status: "obtained",
        imageMetadataFieldCount: 1,
        exifFieldCount: 1,
        hasOriginalFilename: true,
        hasEtag: true,
        reason: null,
      },
      ocrClaim: { ...baseInput().ocrClaim, status: "unavailable" },
      visualContent: {
        ...baseInput().visualContent,
        status: "unavailable",
        reason: "no visual analysis",
      },
      duplicate: {
        ...baseInput().duplicate,
        status: "unavailable",
        reason: "no reference assets",
      },
      mediaQuality: { status: "obtained", focus: 0.4, reason: null },
    });
    const result = calculateConsistencyScore(input);
    assert.equal(
      result.components.find((c) => c.signal === "metadata")?.score,
      100,
    );
    assert.equal(result.coverage, 30);
    assert.equal(result.score, 80);
    assert.equal(result.status, "VERIFIED");
  });

  test("score of exactly79 is REVIEW through the full pipeline", () => {
    const input = baseInput({
      metadata: {
        status: "obtained",
        imageMetadataFieldCount: 1,
        exifFieldCount: 1,
        hasOriginalFilename: true,
        hasEtag: true,
        reason: null,
      },
      ocrClaim: { ...baseInput().ocrClaim, status: "unavailable" },
      visualContent: {
        ...baseInput().visualContent,
        status: "unavailable",
        reason: "no visual analysis",
      },
      duplicate: {
        ...baseInput().duplicate,
        status: "unavailable",
        reason: "no reference assets",
      },
      mediaQuality: { status: "obtained", focus: 0.37, reason: null },
    });
    const result = calculateConsistencyScore(input);
    assert.equal(result.coverage, 30);
    assert.equal(result.score, 79);
    assert.equal(result.status, "REVIEW");
  });

  test("poor signals across components → FLAGGED in the full pipeline", () => {
    // ocr contradicts claim (0, weight25) + identical duplicate (0, weight20)
    // + focus0.1 (10, weight10): (0+0+100)/55 =1.82 →2 → FLAGGED
    const input = baseInput({
      metadata: { ...baseInput().metadata, status: "unavailable", reason: "gone" },
      ocrClaim: {
        status: "obtained",
        ocrText: "nothing relevant at all",
        claim: "Accident on Main Road",
        reason: null,
      },
      visualContent: { ...baseInput().visualContent, status: "unavailable", reason: "gone" },
      duplicate: {
        status: "obtained",
        phash: "0000000000000000",
        referenceHashes: ["0000000000000000"],
        reason: null,
      },
      mediaQuality: { status: "obtained", focus: 0.1, reason: null },
    });
    const result = calculateConsistencyScore(input);
    assert.equal(result.coverage, 55);
    assert.equal(result.score, 2);
    assert.equal(result.status, "FLAGGED");
    assert.ok(result.reasons.some((r) => r.kind === "concern"));
  });
});

describe("weighted scoring", () => {
  test("base input scores (20×100 + 25×100 + 10×90) / 55 = 98 → VERIFIED", () => {
    const result = calculateConsistencyScore(baseInput());
    const byKey = new Map(result.components.map((c) => [c.signal, c]));
    assert.equal(byKey.get("metadata")?.score, 100);
    assert.equal(byKey.get("visualContent")?.score, 100);
    assert.equal(byKey.get("mediaQuality")?.score, 90);
    assert.equal(byKey.get("ocrClaim")?.status, "unavailable");
    assert.equal(byKey.get("duplicate")?.status, "unavailable");
    assert.equal(result.coverage, 55);
    assert.equal(result.score, 98);
    assert.equal(result.status, "VERIFIED");
    assert.equal(byKey.get("metadata")?.contribution, 36.36);
    assert.equal(byKey.get("visualContent")?.contribution, 45.45);
    assert.equal(byKey.get("mediaQuality")?.contribution, 16.36);
    assert.equal(byKey.get("ocrClaim")?.contribution, null);
  });

  test("deterministic half-up rounding: (25×75 + 25×100) / 50 = 87.5 → 88", () => {
    const input = baseInput({
      metadata: { ...baseInput().metadata, status: "unavailable", reason: "gone" },
      ocrClaim: {
        status: "obtained",
        ocrText: "alpha bravo charlie",
        claim: "alpha bravo charlie delta",
        reason: null,
      },
      duplicate: {
        status: "unavailable",
        phash: "c9635a63eacf11c1",
        referenceHashes: [],
        reason: "No reference assets were available to compare against.",
      },
      mediaQuality: { status: "unavailable", focus: null, reason: "no quality" },
    });
    const result = calculateConsistencyScore(input);
    const ocr = result.components.find((c) => c.signal === "ocrClaim");
    assert.equal(ocr?.score, 75); //3 of4 claim terms found
    assert.equal(result.coverage, 50); //25 (ocr) +25 (visual)
    assert.equal(result.score, 88); // Math.round(87.5) =88
    assert.equal(result.status, "VERIFIED");
  });

  test("OCR/claim overlap gives full credit when all claim terms appear", () => {
    const input = baseInput({
      ocrClaim: {
        status: "obtained",
        ocrText: "ACCIDENT - Main Road\nClosure notice in effect",
        claim: "Accident on Main Road",
        reason: null,
      },
    });
    const result = calculateConsistencyScore(input);
    const ocr = result.components.find((c) => c.signal === "ocrClaim");
    assert.equal(ocr?.score, 100);
    assert.ok(
      result.reasons.some(
        (r) => r.signal === "ocrClaim" && r.kind === "positive",
      ),
    );
  });

  test("OCR/claim overlap flags divergence between claim and detected text", () => {
    const input = baseInput({
      ocrClaim: {
        status: "obtained",
        ocrText: "totally unrelated gibberish content",
        claim: "Accident on Main Road",
        reason: null,
      },
    });
    const result = calculateConsistencyScore(input);
    const ocr = result.components.find((c) => c.signal === "ocrClaim");
    assert.equal(ocr?.score, 0);
    assert.ok(
      result.reasons.some(
        (r) => r.signal === "ocrClaim" && r.kind === "concern",
      ),
    );
  });
});

describe("missing-data handling", () => {
  test("unavailable signals are excluded, disclosed, and never scored as inconsistencies", () => {
    const withUnavailableOcr = calculateConsistencyScore(baseInput());
    const withBadOcr = calculateConsistencyScore(
      baseInput({
        ocrClaim: {
          status: "obtained",
          ocrText: "nothing relevant at all",
          claim: "Accident on Main Road",
          reason: null,
        },
      }),
    );
    // Missing OCR must not drag the score down the way contradicting OCR does.
    assert.ok(withUnavailableOcr.score > withBadOcr.score);
    assert.ok(
      withUnavailableOcr.reasons.some(
        (r) =>
          r.signal === "ocrClaim" &&
          r.kind === "info" &&
          r.message.includes("excluded from scoring"),
      ),
    );
    assert.deepEqual(
      withUnavailableOcr.unavailableSignals.map((u) => u.signal).sort(),
      ["duplicate", "ocrClaim"],
    );
    assert.ok(
      withUnavailableOcr.reasons.some(
        (r) =>
          r.signal === "coverage" && r.message.includes("55 of100 weight points"),
      ),
    );
  });

  test("all signals unavailable → inconclusive: score0, status REVIEW", () => {
    const input: ForensicEngineInput = {
      metadata: { ...baseInput().metadata, status: "unavailable", reason: "gone" },
      ocrClaim: { ...baseInput().ocrClaim, status: "error", reason: "boom" },
      visualContent: {
        ...baseInput().visualContent,
        status: "unavailable",
        reason: "gone",
      },
      duplicate: { ...baseInput().duplicate, status: "unavailable", reason: "gone" },
      mediaQuality: { ...baseInput().mediaQuality, status: "unavailable", reason: "gone" },
    };
    const result = calculateConsistencyScore(input);
    assert.equal(result.coverage, 0);
    assert.equal(result.score, 0);
    assert.equal(result.status, "REVIEW");
    assert.equal(result.unavailableSignals.length, 5);
    assert.ok(result.reasons.some((r) => r.message.includes("inconclusive")));
    assert.ok(result.components.every((c) => c.contribution === null));
  });

  test("partial coverage is always explained in the reasons", () => {
    const result = calculateConsistencyScore(baseInput());
    const coverageReason = result.reasons.find((r) => r.signal === "coverage");
    assert.ok(coverageReason);
    assert.match(coverageReason.message, /weight points were scoreable/);
  });
});

describe("determinism", () => {
  test("identical input produces byte-identical output", () => {
    const input = baseInput();
    const first = calculateConsistencyScore(input);
    const second = calculateConsistencyScore(input);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    const keys = Object.keys(first).sort();
    assert.deepEqual(keys, [
      "components",
      "coverage",
      "engineVersion",
      "reasons",
      "score",
      "status",
      "unavailableSignals",
    ]);
  });

  test("input is not mutated by scoring", () => {
    const input = baseInput();
    const snapshot = JSON.stringify(input);
    calculateConsistencyScore(input);
    assert.equal(JSON.stringify(input), snapshot);
  });
});

describe("component rubrics", () => {
  test("visual rubric deductions: illustration, transparency, grayscale", () => {
    const strong = calculateConsistencyScore(
      baseInput({
        visualContent: {
          status: "obtained",
          illustrationScore: 0.9,
          isGrayscale: true,
          isSemiTransparent: true,
          reason: null,
        },
      }),
    );
    const visual = strong.components.find((c) => c.signal === "visualContent");
    //100 −40 (illustration ≥0.5) −15 (semi-transparent) −10 (grayscale) =35
    assert.equal(visual?.score, 35);
    assert.ok(
      strong.reasons.some(
        (r) => r.signal === "visualContent" && r.kind === "concern",
      ),
    );

    const mild = calculateConsistencyScore(
      baseInput({
        visualContent: {
          status: "obtained",
          illustrationScore: 0.2,
          isGrayscale: false,
          isSemiTransparent: false,
          reason: null,
        },
      }),
    );
    assert.equal(
      mild.components.find((c) => c.signal === "visualContent")?.score,
      85, //100 −15 (illustration ≥0.1)
    );

    const clean = calculateConsistencyScore(baseInput());
    assert.ok(
      clean.reasons.some(
        (r) =>
          r.signal === "visualContent" &&
          r.kind === "positive" &&
          r.message.includes("no graphic anomalies"),
      ),
    );
  });

  test("media quality maps focus to0–100 with concern below0.3", () => {
    const low = calculateConsistencyScore(
      baseInput({
        mediaQuality: { status: "obtained", focus: 0.1, reason: null },
      }),
    );
    assert.equal(
      low.components.find((c) => c.signal === "mediaQuality")?.score,
      10,
    );
    assert.ok(
      low.reasons.some(
        (r) => r.signal === "mediaQuality" && r.kind === "concern",
      ),
    );
    const missing = calculateConsistencyScore(
      baseInput({
        mediaQuality: { status: "obtained", focus: null, reason: null },
      }),
    );
    assert.equal(
      missing.components.find((c) => c.signal === "mediaQuality")?.status,
      "unavailable",
    );
  });

  test("fingerprint: identical hash → duplicate concern with score0", () => {
    const result = calculateConsistencyScore(
      baseInput({
        duplicate: {
          status: "obtained",
          phash: "0000000000000000",
          referenceHashes: ["0000000000000000"],
          reason: null,
        },
      }),
    );
    const dup = result.components.find((c) => c.signal === "duplicate");
    assert.equal(dup?.score, 0);
    assert.ok(
      result.reasons.some(
        (r) => r.signal === "duplicate" && r.kind === "concern",
      ),
    );
  });

  test("fingerprint: far hash → no duplicate, score100", () => {
    const result = calculateConsistencyScore(
      baseInput({
        duplicate: {
          status: "obtained",
          phash: "0000000000000000",
          referenceHashes: ["ffffffffffffffff"],
          reason: null,
        },
      }),
    );
    const dup = result.components.find((c) => c.signal === "duplicate");
    assert.equal(dup?.score, 100); //64 bits apart ≥16 →100
    assert.ok(
      result.reasons.some(
        (r) => r.signal === "duplicate" && r.kind === "positive",
      ),
    );
  });

  test("fingerprint: missing hash or references → unavailable, not a penalty", () => {
    const noHash = calculateConsistencyScore(
      baseInput({
        duplicate: {
          status: "obtained",
          phash: null,
          referenceHashes: ["ffffffffffffffff"],
          reason: null,
        },
      }),
    );
    assert.equal(
      noHash.components.find((c) => c.signal === "duplicate")?.status,
      "unavailable",
    );
    const noRefs = calculateConsistencyScore(baseInput());
    assert.ok(
      noRefs.unavailableSignals.find((u) => u.signal === "duplicate")?.reason
        .includes("No reference assets"),
    );
  });

  test("hammingDistanceHex basics", () => {
    assert.equal(hammingDistanceHex("abc", "abc"), 0);
    assert.equal(hammingDistanceHex("0", "f"), 4);
    assert.equal(hammingDistanceHex("0000", "ffff"), 16);
    assert.equal(hammingDistanceHex("abc", "ab"), null); // length mismatch
    assert.equal(hammingDistanceHex("zz", "zz"), null); // invalid hex
  });

  test("tokenize normalizes case, punctuation and stopwords", () => {
    assert.deepEqual(tokenize("The dog and the cat!"), ["dog", "cat"]);
    assert.deepEqual(tokenize("MAIN Road, 2026"), ["main", "road", "2026"]);
    assert.deepEqual(tokenize("ok — no"), []); // both below min length
  });

  test("normalizeInput clamps and coerces malformed values", () => {
    const messy = baseInput({
      mediaQuality: { status: "obtained" as const, focus: 1.5, reason: null },
      duplicate: {
        status: "obtained" as const,
        phash: "C9635A63EACF11C1", // uppercase normalized
        referenceHashes: [
          "ffffffffffffffff",
          "FFFFFFFFFFFFFFFF", // dedupe after normalization
          "not-a-hash", // dropped
          "0000000000000000",
        ],
        reason: null,
      },
    });
    const normalized = normalizeInput(messy);
    assert.equal(normalized.mediaQuality.focus, 1); // clamped
    assert.equal(normalized.duplicate.phash, "c9635a63eacf11c1");
    assert.deepEqual(normalized.duplicate.referenceHashes, [
      "0000000000000000",
      "ffffffffffffffff",
    ]);
    const invalidStatus = normalizeInput({
      ...baseInput(),
      metadata: { ...baseInput().metadata, status: "weird" as never },
    });
    assert.equal(invalidStatus.metadata.status, "unavailable");
  });
});




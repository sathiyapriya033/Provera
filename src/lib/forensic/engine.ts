/**
 * Provera — Deterministic Forensic Consistency Engine (Phase 3).
 *
 * A standalone, pure module: no UI code, no Cloudinary SDK, no network calls,
 * no clock and no randomness. Given the same normalized input and the same
 * ENGINE_VERSION, it always produces the same score, status and reasons.
 *
 * Scoring model (product-defined heuristic weights — NOT scientifically
 * validated measurements, and NOT a probability of fraud):
 *
 *   Metadata availability             20%
 *   OCR / claim consistency           25%
 *   Visual / content consistency      25%
 *   Duplicate / fingerprint indicator 20%
 *   Media quality / analysis signals  10%
 *
 * Missing-data rule (documented implementation choice, see
 * docs/FORENSIC_ENGINE.md): unavailable or errored signals are EXCLUDED from
 * both the weighted sum and the total weight. They neither inflate nor penalize
 * the score; every exclusion is disclosed through `unavailableSignals` and an
 * info reason, and the resulting `coverage` is reported. Unavailable data is
 * never treated as a confirmed inconsistency and no favorable value is ever
 * imputed.
 *
 * Special case: when no signal is scoreable (coverage = 0) the result is
 * inconclusive — score 0 with status REVIEW and an explicit reason.
 */

/** Version identifier stored with every result (and later, with records). */
export const ENGINE_VERSION = "provera-forensic@1";

export type ComponentKey =
  | "metadata"
  | "ocrClaim"
  | "visualContent"
  | "duplicate"
  | "mediaQuality";

/** Explicit weights in percent. Sum = 100 (asserted by unit tests). */
export const ENGINE_WEIGHTS: Record<ComponentKey, number> = {
  metadata: 20,
  ocrClaim: 25,
  visualContent: 25,
  duplicate: 20,
  mediaQuality: 10,
};

/** Fixed component order used everywhere (determinism). */
export const COMPONENT_ORDER: readonly ComponentKey[] = [
  "metadata",
  "ocrClaim",
  "visualContent",
  "duplicate",
  "mediaQuality",
];

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  metadata: "Metadata availability",
  ocrClaim: "OCR / claim consistency",
  visualContent: "Visual / content consistency",
  duplicate: "Duplicate / fingerprint indicator",
  mediaQuality: "Media quality / analysis signals",
};

export type EngineSignalStatus = "obtained" | "unavailable" | "error";

export type ForensicEngineInput = {
  metadata: {
    status: EngineSignalStatus;
    imageMetadataFieldCount: number;
    exifFieldCount: number;
    hasOriginalFilename: boolean;
    hasEtag: boolean;
    /** Why the signal is unavailable/failed, when it is. */
    reason: string | null;
  };
  ocrClaim: {
    status: EngineSignalStatus;
    /** Detected image text (empty string = OCR ran and found no text). */
    ocrText: string | null;
    /** User-submitted claim/context to compare against the detected text. */
    claim: string | null;
    reason: string | null;
  };
  visualContent: {
    status: EngineSignalStatus;
    illustrationScore: number | null;
    isGrayscale: boolean | null;
    isSemiTransparent: boolean | null;
    reason: string | null;
  };
  duplicate: {
    status: EngineSignalStatus;
    /** Cloudinary perceptual hash of the analyzed asset (16 hex chars). */
    phash: string | null;
    /** Reference hashes to compare against; empty = nothing to compare. */
    referenceHashes: string[];
    reason: string | null;
  };
  mediaQuality: {
    status: EngineSignalStatus;
    /** Cloudinary quality-analysis focus score, expected in 0–1. */
    focus: number | null;
    reason: string | null;
  };
};

export type ForensicStatus = "VERIFIED" | "REVIEW" | "FLAGGED";

export type ReasonKind = "positive" | "concern" | "info";

export type ForensicReason = {
  signal: ComponentKey | "coverage";
  kind: ReasonKind;
  message: string;
};

const STOPWORDS: ReadonlySet<string> = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can",
  "her", "was", "one", "our", "out", "who", "has", "have", "this", "that",
  "with", "from", "they", "been", "said", "each", "which", "their", "will",
  "other", "about", "many", "then", "them", "would", "make", "like", "into",
  "time", "look", "two", "more", "write", "see", "number", "way", "could",
  "people", "than", "first", "call", "now", "find", "long", "down", "day",
  "did", "get", "come", "made", "part", "over", "also", "new", "some", "how",
  "its", "our", "was", "were", "when", "where", "what", "why", "does", "did",
]);

/** Deterministic tokenizer: lowercase, alphanumeric words of length ≥3. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

/** Status thresholds:80–100 VERIFIED,50–79 REVIEW,0–49 FLAGGED. */
export function statusForScore(score: number): ForensicStatus {
  if (score >= 80) return "VERIFIED";
  if (score >= 50) return "REVIEW";
  return "FLAGGED";
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function asCount(value: unknown): number {
  const n = asFiniteNumber(value);
  if (n === null || n < 0) return 0;
  return Math.floor(n);
}

function asStatus(value: unknown): EngineSignalStatus {
  return value === "obtained" || value === "unavailable" || value === "error"
    ? value
    : "unavailable";
}

function asReason(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asOptionalText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

const PHASH_PATTERN = /^[0-9a-f]{16}$/;

function normalizePhash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return PHASH_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Normalizes raw input before scoring (plan task3): clamps numbers, coerces
 * statuses, lowercases hashes and de-duplicates reference hashes. Malformed
 * values become explicit nulls/unavailable states — never favorable values.
 */
export function normalizeInput(
  input: ForensicEngineInput,
): ForensicEngineInput {
  const metadataStatus = asStatus(input.metadata.status);
  const ocrStatus = asStatus(input.ocrClaim.status);
  const visualStatus = asStatus(input.visualContent.status);
  const duplicateStatus = asStatus(input.duplicate.status);
  const qualityStatus = asStatus(input.mediaQuality.status);

  const referenceHashes = Array.isArray(input.duplicate.referenceHashes)
    ? Array.from(
        new Set(
          input.duplicate.referenceHashes
            .map((hash) => normalizePhash(hash))
            .filter((hash): hash is string => hash !== null),
        ),
      ).sort()
    : [];

  return {
    metadata: {
      status: metadataStatus,
      imageMetadataFieldCount: asCount(input.metadata.imageMetadataFieldCount),
      exifFieldCount: asCount(input.metadata.exifFieldCount),
      hasOriginalFilename: Boolean(input.metadata.hasOriginalFilename),
      hasEtag: Boolean(input.metadata.hasEtag),
      reason: asReason(input.metadata.reason),
    },
    ocrClaim: {
      status: ocrStatus,
      ocrText: asOptionalText(input.ocrClaim.ocrText),
      claim: asOptionalText(input.ocrClaim.claim)?.trim() || null,
      reason: asReason(input.ocrClaim.reason),
    },
    visualContent: {
      status: visualStatus,
      illustrationScore: (() => {
        const n = asFiniteNumber(input.visualContent.illustrationScore);
        return n === null ? null : clamp01(n);
      })(),
      isGrayscale:
        typeof input.visualContent.isGrayscale === "boolean"
          ? input.visualContent.isGrayscale
          : null,
      isSemiTransparent:
        typeof input.visualContent.isSemiTransparent === "boolean"
          ? input.visualContent.isSemiTransparent
          : null,
      reason: asReason(input.visualContent.reason),
    },
    duplicate: {
      status: duplicateStatus,
      phash: normalizePhash(input.duplicate.phash),
      referenceHashes,
      reason: asReason(input.duplicate.reason),
    },
    mediaQuality: {
      status: qualityStatus,
      focus: (() => {
        const n = asFiniteNumber(input.mediaQuality.focus);
        return n === null ? null : clamp01(n);
      })(),
      reason: asReason(input.mediaQuality.reason),
    },
  };
}

/** Bitwise Hamming distance between two equal-length hex strings. */
export function hammingDistanceHex(a: string, b: string): number | null {
  if (a.length !== b.length || a.length === 0) return null;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    const nibbleA = parseInt(a[i], 16);
    const nibbleB = parseInt(b[i], 16);
    if (Number.isNaN(nibbleA) || Number.isNaN(nibbleB)) return null;
    let diff = nibbleA ^ nibbleB;
    while (diff > 0) {
      distance += diff & 1;
      diff >>= 1;
    }
  }
  return distance;
}

export type ComponentResult = {
  signal: ComponentKey;
  label: string;
  /** Weight in percent of the total100. */
  weight: number;
  status: "scored" | "unavailable";
  /** Component score0–100, or null when unavailable. */
  score: number | null;
  /** Weighted points contributed to the final score (2-decimal, or null). */
  contribution: number | null;
  /** Human-readable interpretation of this component's result. */
  summary: string;
};

export type ForensicResult = {
  engineVersion: string;
  /** Final score0–100 (integer). */
  score: number;
  status: ForensicStatus;
  /** Sum of weights of the scoreable components (0–100). */
  coverage: number;
  components: ComponentResult[];
  reasons: ForensicReason[];
  unavailableSignals: Array<{ signal: ComponentKey; reason: string }>;
};

type ScoredOutcome = {
  status: "scored";
  score: number;
  summary: string;
  reasons: ForensicReason[];
};

type UnavailableOutcome = {
  status: "unavailable";
  reason: string;
};

type ComponentOutcome = ScoredOutcome | UnavailableOutcome;

function unavailableOutcome(reason: string): UnavailableOutcome {
  return { status: "unavailable", reason };
}

/**
 * Metadata availability rubric (0–100):
 *   +40 image-metadata fields present (IPTC/XMP/JFIF)
 *   +30 EXIF fields present
 *   +15 original filename retained
 *   +15 entity tag (etag) present
 */
function scoreMetadata(
  input: ForensicEngineInput["metadata"],
): ComponentOutcome {
  if (input.status !== "obtained") {
    return unavailableOutcome(
      input.reason ?? "Metadata signal was not obtained.",
    );
  }
  let score = 0;
  if (input.imageMetadataFieldCount > 0) score += 40;
  if (input.exifFieldCount > 0) score += 30;
  if (input.hasOriginalFilename) score += 15;
  if (input.hasEtag) score += 15;

  const reasons: ForensicReason[] = [];
  if (score >= 70) {
    reasons.push({
      signal: "metadata",
      kind: "positive",
      message: "Expected metadata was present on the asset.",
    });
  } else if (score < 50) {
    reasons.push({
      signal: "metadata",
      kind: "concern",
      message: "Little metadata was available on the asset.",
    });
  } else {
    reasons.push({
      signal: "metadata",
      kind: "info",
      message: `Partial metadata availability (${score}/100).`,
    });
  }

  return {
    status: "scored",
    score,
    summary: `Metadata availability scored ${score}/100 (${input.imageMetadataFieldCount} image-metadata fields, ${input.exifFieldCount} EXIF fields).`,
    reasons,
  };
}

/**
 * OCR / claim consistency: deterministic term-overlap between the submitted
 * claim and the text detected in the image. Unavailable when OCR output, a
 * claim, or comparable claim terms are missing — missing evidence is never
 * scored as an inconsistency.
 */
function scoreOcrClaim(
  input: ForensicEngineInput["ocrClaim"],
): ComponentOutcome {
  if (input.status !== "obtained") {
    return unavailableOutcome(
      input.reason ?? "OCR signal was not obtained.",
    );
  }
  const claim = input.claim;
  if (!claim) {
    return unavailableOutcome(
      "No claim/context was submitted, so OCR output cannot be compared against a claim.",
    );
  }
  if (input.ocrText === null) {
    return unavailableOutcome("No OCR text was available for comparison.");
  }
  const ocrText = input.ocrText.trim();
  if (ocrText.length === 0) {
    return unavailableOutcome(
      "OCR detected no text in the image, so there is nothing to compare against the claim.",
    );
  }
  const claimTokens = Array.from(new Set(tokenize(claim)));
  if (claimTokens.length === 0) {
    return unavailableOutcome(
      "The submitted claim contains no comparable terms after normalization.",
    );
  }
  const ocrTokens = new Set(tokenize(ocrText));
  const matched = claimTokens.filter((token) => ocrTokens.has(token)).length;
  const score = Math.round((matched / claimTokens.length) * 100);

  const reasons: ForensicReason[] = [];
  if (score >= 80) {
    reasons.push({
      signal: "ocrClaim",
      kind: "positive",
      message: "The submitted claim terms appear in the detected image text.",
    });
  } else if (score < 50) {
    reasons.push({
      signal: "ocrClaim",
      kind: "concern",
      message: `The submitted claim shares few terms with the detected image text (${score}% overlap).`,
    });
  } else {
    reasons.push({
      signal: "ocrClaim",
      kind: "info",
      message: `Partial overlap between the submitted claim and the detected image text (${score}%).`,
    });
  }

  return {
    status: "scored",
    score,
    summary: `Claim/image-text overlap: ${matched}/${claimTokens.length} claim terms found in the detected text.`,
    reasons,
  };
}

/**
 * Visual / content consistency rubric (0–100), based on observable visual
 * analysis only:
 *   start at100
 *   −40 illustration score ≥0.5 (−15 when ≥0.1): graphic/illustrated content
 *   −15 image is semi-transparent (alpha channel)
 *   −10 image is grayscale
 * Clamped at0. Deductions are consistency concerns for photographic field
 * media — not proof of manipulation.
 */
function scoreVisualContent(
  input: ForensicEngineInput["visualContent"],
): ComponentOutcome {
  if (input.status !== "obtained") {
    return unavailableOutcome(
      input.reason ?? "Visual analysis signal was not obtained.",
    );
  }

  let score = 100;
  const reasons: ForensicReason[] = [];
  const illustration = input.illustrationScore;
  if (illustration !== null && illustration >= 0.5) {
    score -= 40;
    reasons.push({
      signal: "visualContent",
      kind: "concern",
      message: `Image content scores as illustration-like (illustration score ${illustration.toFixed(3)}), which is atypical for photographic field media.`,
    });
  } else if (illustration !== null && illustration >= 0.1) {
    score -= 15;
    reasons.push({
      signal: "visualContent",
      kind: "concern",
      message: `Image content shows some illustration-like characteristics (illustration score ${illustration.toFixed(3)}).`,
    });
  }
  if (input.isSemiTransparent === true) {
    score -= 15;
    reasons.push({
      signal: "visualContent",
      kind: "concern",
      message:
        "The image is semi-transparent, which is atypical for finished field photographs.",
    });
  }
  if (input.isGrayscale === true) {
    score -= 10;
    reasons.push({
      signal: "visualContent",
      kind: "info",
      message: "The image is grayscale.",
    });
  }
  score = Math.max(0, score);
  if (reasons.length === 0) {
    reasons.push({
      signal: "visualContent",
      kind: "positive",
      message: "Visual analysis reported no graphic anomalies.",
    });
  }

  return {
    status: "scored",
    score,
    summary: `Visual analysis rubric scored ${score}/100.`,
    reasons,
  };
}

/**
 * Duplicate / fingerprint indicator: bitwise Hamming distance between this
 * asset's perceptual hash and the closest reference hash. Score maps
 * distance d (0–64 bits) as round(min(d,16)/16 ×100): d=0 →0 (identical),
 * d≥16 →100 (no near-duplicate). Concern when d≤8. Unavailable when no
 * reference hashes exist — there is then no evidence either way.
 */
function scoreDuplicate(
  input: ForensicEngineInput["duplicate"],
): ComponentOutcome {
  if (input.status !== "obtained") {
    return unavailableOutcome(
      input.reason ?? "Fingerprint signal was not obtained.",
    );
  }
  if (input.phash === null) {
    return unavailableOutcome(
      "No perceptual hash was available for duplicate comparison.",
    );
  }
  if (input.referenceHashes.length === 0) {
    return unavailableOutcome(
      "No reference assets were available to compare against.",
    );
  }
  let nearest: number | null = null;
  let compared = 0;
  for (const reference of input.referenceHashes) {
    const distance = hammingDistanceHex(input.phash, reference);
    if (distance === null) continue;
    compared += 1;
    if (nearest === null || distance < nearest) nearest = distance;
  }
  if (nearest === null || compared === 0) {
    return unavailableOutcome(
      "Reference hashes were invalid for perceptual-hash comparison.",
    );
  }

  const score = Math.round((Math.min(nearest, 16) / 16) * 100);
  const reasons: ForensicReason[] = [];
  if (nearest <= 8) {
    reasons.push({
      signal: "duplicate",
      kind: "concern",
      message: `Near-duplicate detected: an existing asset's perceptual hash differs by only ${nearest} bit(s).`,
    });
  } else if (nearest >= 16) {
    reasons.push({
      signal: "duplicate",
      kind: "positive",
      message: `No near-duplicates found among ${compared} reference hash(es).`,
    });
  } else {
    reasons.push({
      signal: "duplicate",
      kind: "info",
      message: `Some similarity to a reference asset (Hamming distance ${nearest} of64 bits).`,
    });
  }

  return {
    status: "scored",
    score,
    summary: `Nearest reference hash distance: ${nearest} of64 bits (${compared} reference hash(es) compared).`,
    reasons,
  };
}

/**
 * Media quality rubric: the Cloudinary quality-analysis focus score (0–1)
 * scaled to0–100. Concern below0.3, positive at/above0.7.
 */
function scoreMediaQuality(
  input: ForensicEngineInput["mediaQuality"],
): ComponentOutcome {
  if (input.status !== "obtained") {
    return unavailableOutcome(
      input.reason ?? "Media-quality signal was not obtained.",
    );
  }
  if (input.focus === null) {
    return unavailableOutcome(
      "No quality-analysis result was available for this asset.",
    );
  }
  const score = Math.round(input.focus * 100);
  const reasons: ForensicReason[] = [];
  if (input.focus < 0.3) {
    reasons.push({
      signal: "mediaQuality",
      kind: "concern",
      message: `Quality analysis reported low focus (${input.focus.toFixed(3)}).`,
    });
  } else if (input.focus >= 0.7) {
    reasons.push({
      signal: "mediaQuality",
      kind: "positive",
      message: `Quality analysis reported strong focus (${input.focus.toFixed(3)}).`,
    });
  } else {
    reasons.push({
      signal: "mediaQuality",
      kind: "info",
      message: `Quality analysis reported moderate focus (${input.focus.toFixed(3)}).`,
    });
  }

  return {
    status: "scored",
    score,
    summary: `Cloudinary quality-analysis focus ${input.focus.toFixed(3)} → ${score}/100.`,
    reasons,
  };
}

/**
 * Calculates the Forensic Consistency Score for a normalized input.
 *
 * Deterministic: no clock, no randomness, no external calls. The same input
 * under the same ENGINE_VERSION always yields an identical result.
 *
 * Missing-data rule: unavailable components are excluded from both the
 * weighted sum and the weight total (coverage), with every exclusion
 * disclosed. Final score = round(Σ(weight × componentScore) / coverage).
 */
export function calculateConsistencyScore(
  rawInput: ForensicEngineInput,
): ForensicResult {
  const input = normalizeInput(rawInput);

  const outcomes: Record<ComponentKey, ComponentOutcome> = {
    metadata: scoreMetadata(input.metadata),
    ocrClaim: scoreOcrClaim(input.ocrClaim),
    visualContent: scoreVisualContent(input.visualContent),
    duplicate: scoreDuplicate(input.duplicate),
    mediaQuality: scoreMediaQuality(input.mediaQuality),
  };

  const components: ComponentResult[] = [];
  const reasons: ForensicReason[] = [];
  const unavailableSignals: ForensicResult["unavailableSignals"] = [];

  let coverage = 0;
  let weightedSum = 0;

  for (const signal of COMPONENT_ORDER) {
    const weight = ENGINE_WEIGHTS[signal];
    const outcome = outcomes[signal];
    if (outcome.status === "unavailable") {
      components.push({
        signal,
        label: COMPONENT_LABELS[signal],
        weight,
        status: "unavailable",
        score: null,
        contribution: null,
        summary: `Excluded from scoring: ${outcome.reason}`,
      });
      unavailableSignals.push({ signal, reason: outcome.reason });
      reasons.push({
        signal,
        kind: "info",
        message: `${COMPONENT_LABELS[signal]} was unavailable and excluded from scoring: ${outcome.reason}`,
      });
      continue;
    }
    coverage += weight;
    weightedSum += weight * outcome.score;
    components.push({
      signal,
      label: COMPONENT_LABELS[signal],
      weight,
      status: "scored",
      score: outcome.score,
      contribution: null, // filled below once coverage is final
      summary: outcome.summary,
    });
    reasons.push(...outcome.reasons);
  }

  let score: number;
  let status: ForensicStatus;
  if (coverage === 0) {
    // Documented special case: nothing to score → inconclusive result.
    score = 0;
    status = "REVIEW";
    reasons.push({
      signal: "coverage",
      kind: "info",
      message:
        "No signals were available for scoring — the result is inconclusive (score0, status REVIEW).",
    });
  } else {
    score = Math.round(weightedSum / coverage);
    status = statusForScore(score);
    if (coverage < 100) {
      reasons.push({
        signal: "coverage",
        kind: "info",
        message: `${coverage} of100 weight points were scoreable; unavailable signals were excluded from the calculation rather than counted as inconsistencies.`,
      });
    }
  }

  for (const component of components) {
    if (
      component.status === "scored" &&
      component.score !== null &&
      coverage > 0
    ) {
      component.contribution =
        Math.round(((component.weight * component.score) / coverage) * 100) /
        100;
    }
  }

  return {
    engineVersion: ENGINE_VERSION,
    score,
    status,
    coverage,
    components,
    reasons,
    unavailableSignals,
  };
}


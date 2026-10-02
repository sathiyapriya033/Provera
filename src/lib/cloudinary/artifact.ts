import { v2 as cloudinary } from "cloudinary";
import type { VerificationRecord } from "@/lib/verification/record";

/**
 * Provera — signed verification artifact (Phase 5).
 *
 * The artifact is a Cloudinary *dynamic transformation* of the managed asset:
 * a fixed dark canvas with text layers carrying the verification state from the
 * stored record. Nothing is stored server-side — Cloudinary generates and caches
 * the derived image on first request, which is why this module builds a signed
 * delivery URL and then *verifies* that the URL really serves an image.
 *
 * Delivery integrity, verified against this account (see docs/CLOUDINARY.md):
 * the URL carries a Cloudinary signature computed from the API secret, and any
 * modification of the transformation invalidates that signature. Cloudinary only
 * *rejects* unsigned or tampered URLs for restricted delivery — for the publicly
 * delivered `upload` assets used here it serves the transformation regardless.
 * So this signature is an integrity marker for the requested transformation, not
 * an access-control mechanism, and it never proves the source photo is genuine.
 *
 * Cloudinary-specific code stays in this adapter: the engine and the record model
 * never see a Cloudinary URL. The module is deliberately free of relative runtime
 * imports (only `cloudinary` plus erased type imports) so it can be unit tested
 * with Node's native TypeScript stripping.
 */

/** Version identifier stored in the artifact and returned to clients. */
export const ARTIFACT_VERSION = "provera-artifact@1";

/** Fixed artifact canvas (letterboxes the source image on a dark background). */
export const ARTIFACT_CANVAS = { width: 1200, height: 1200 } as const;

/** Canvas/overlay palette. Dark enough that every text layer stays legible. */
const ARTIFACT_BACKGROUND = "#0f172a";

/** Number of leading hash characters printed on the artifact. */
export const SHORT_HASH_LENGTH = 16;

/** Statuses the artifact can display (matches the Phase 3 status union). */
export type ArtifactStatus = "VERIFIED" | "REVIEW" | "FLAGGED";

export const ARTIFACT_STATUS_COLORS: Record<ArtifactStatus, string> = {
  VERIFIED: "#34d399",
  REVIEW: "#fbbf24",
  FLAGGED: "#f87171",
};

export type ArtifactCredentials = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

/** Everything the artifact needs from a stored record — no Cloudinary types. */
export type ArtifactInput = {
  publicId: string;
  resourceType: string;
  status: ArtifactStatus;
  score: number;
  recordId: string;
  recordHash: string;
  engineVersion: string;
  timestamp: string;
  /** Absolute URL a third party can open to retrieve the record. */
  verificationUrl: string;
};

/** One transformation component, in the order it appears in the URL. */
export type ArtifactLayer = {
  /** What this component contributes to the artifact. */
  purpose: string;
  /** The exact transformation component from the delivered URL. */
  parameters: string;
};

export type VerificationArtifact = {
  artifactVersion: string;
  recordId: string;
  publicId: string;
  resourceType: string;
  /** Signed Cloudinary delivery URL. */
  url: string;
  /** True when the URL carries a Cloudinary signature. */
  signed: boolean;
  /** Signature value from the `s--…--` segment, safe to display. */
  signature: string | null;
  /** The full transformation string exactly as delivered. */
  transformation: string;
  /** Transformation components in delivery order, for Inspector Mode. */
  layers: ArtifactLayer[];
  canvas: { width: number; height: number };
  optimization: { fetchFormat: "auto"; quality: "auto" };
  verificationUrl: string;
};

export type ArtifactDelivery = {
  verified: true;
  status: number;
  contentType: string | null;
  contentLength: number | null;
  /** Evidence that `f_auto` negotiates the delivered format. */
  negotiated: { accept: string; contentType: string | null; contentLength: number | null }[];
};

/** Honest statement of what the delivery signature does and does not do. */
export const ARTIFACT_SIGNATURE_NOTE =
  "Signed with the Cloudinary account API secret: any change to the transformation invalidates the signature. Cloudinary rejects unsigned delivery only for restricted assets — this source asset is publicly delivered, so the signature marks the requested transformation, it is not access control.";

export class ArtifactError extends Error {
  readonly code = "ARTIFACT_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "ArtifactError";
  }
}

type TextLayerSpec = {
  purpose: string;
  text: (input: ArtifactInput) => string;
  fontSize: number;
  color: (input: ArtifactInput) => string;
  gravity: "north" | "south";
  y: number;
  fontWeight?: "bold";
};

/**
 * The fixed artifact layout. `north` layers render from the top of the canvas
 * and `south` layers from the bottom, so positions stay deterministic for every
 * source aspect ratio; each layer also carries its own dark background so text
 * never depends on the source image being dark.
 */
const TEXT_LAYERS: readonly TextLayerSpec[] = [
  {
    purpose: "Provera branding",
    text: () => "PROVERA",
    fontSize: 40,
    color: () => "#ffffff",
    gravity: "north",
    y: 28,
    fontWeight: "bold",
  },
  {
    purpose: "Artifact subtitle and claim boundary",
    text: () =>
      "Signed verification record - tamper-evident, not proof of authenticity",
    fontSize: 22,
    color: () => "#94a3b8",
    gravity: "north",
    y: 82,
  },
  {
    purpose: "Artifact version and generator",
    text: () =>
      `Artifact ${ARTIFACT_VERSION} - generated by a Cloudinary transformation`,
    fontSize: 18,
    color: () => "#64748b",
    gravity: "north",
    y: 118,
  },
  {
    purpose: "Verification status and Forensic Consistency Score",
    text: (input) => `${input.status}  -  Score ${input.score}/100`,
    fontSize: 52,
    color: (input) => ARTIFACT_STATUS_COLORS[input.status],
    gravity: "south",
    y: 196,
    fontWeight: "bold",
  },
  {
    purpose: "Record ID and short record hash",
    text: (input) =>
      `Record ${input.recordId}  |  Hash ${input.recordHash.slice(0, SHORT_HASH_LENGTH)}`,
    fontSize: 26,
    color: () => "#ffffff",
    gravity: "south",
    y: 130,
  },
  {
    purpose: "Engine version and record timestamp",
    text: (input) =>
      `Engine ${input.engineVersion}  |  ${formatArtifactTimestamp(input.timestamp)}`,
    fontSize: 22,
    color: () => "#cbd5e1",
    gravity: "south",
    y: 90,
  },
  {
    purpose: "Verification destination for this record",
    text: (input) => `Verify: ${input.verificationUrl}`,
    fontSize: 20,
    color: () => "#7dd3fc",
    gravity: "south",
    y: 54,
  },
];

/** Seconds-precision ISO timestamp: the artifact is not a log file. */
export function formatArtifactTimestamp(timestamp: string): string {
  return timestamp.replace(/\.\d+Z$/, "Z");
}

/** Pure mapping from a stored record to the artifact's rendering inputs. */
export function artifactInputFromRecord(
  record: VerificationRecord,
  appUrl: string,
): ArtifactInput {
  const base = appUrl.trim().replace(/\/+$/, "");
  return {
    publicId: record.asset.publicId,
    resourceType: record.asset.resourceType,
    status: record.status,
    score: record.score,
    recordId: record.recordId,
    recordHash: record.recordHash,
    engineVersion: record.engineVersion,
    timestamp: record.timestamp,
    // Phase 6 replaces this with the human-facing /verify/[recordId] page; the
    // record-retrieval endpoint works today and needs no login.
    verificationUrl: `${base}/api/verify/${record.recordId}`,
  };
}

/**
 * Transformation components in delivery order. The first entry describes the
 * canvas, the text layers follow in layout order, and the last entry is the
 * optimized-delivery segment.
 */
function artifactPurposes(): string[] {
  return [
    `Canvas ${ARTIFACT_CANVAS.width}x${ARTIFACT_CANVAS.height}, letterboxed on the artifact background`,
    ...TEXT_LAYERS.map((layer) => layer.purpose),
    "Optimized delivery (f_auto format, q_auto quality)",
  ];
}

/**
 * Builds the transformation array from the fixed layout. Deterministic: the same
 * input always produces the same URL (and therefore the same signature).
 */
function buildTransformation(input: ArtifactInput) {
  return [
    {
      width: ARTIFACT_CANVAS.width,
      height: ARTIFACT_CANVAS.height,
      crop: "pad",
      background: ARTIFACT_BACKGROUND,
    },
    ...TEXT_LAYERS.map((layer) => ({
      overlay: {
        font_family: "Arial",
        font_size: layer.fontSize,
        ...(layer.fontWeight ? { font_weight: layer.fontWeight } : {}),
        text: layer.text(input),
      },
      color: layer.color(input),
      background: ARTIFACT_BACKGROUND,
      gravity: layer.gravity,
      y: layer.y,
    })),
    { fetch_format: "auto", quality: "auto" },
  ];
}

/**
 * Splits a Cloudinary delivery URL into its signature and transformation
 * components. The URL shape is
 * `<cloud>/<resource_type>/<type>/[s--sig--/]<transformations…>/[v<n>/]<public_id…>`,
 * and `publicId` itself may contain slashes, so the asset identity is matched
 * from the end rather than guessed from the path shape.
 */
export function parseArtifactUrl(
  url: string,
  publicId: string,
): { signature: string | null; components: string[] } {
  const segments = new URL(url).pathname.replace(/^\/+/, "").split("/");
  const afterType = segments.slice(3);
  const first = afterType[0] ?? "";
  const signed = /^s--.+--$/.test(first);
  // "s--signature--": the marker is 3 characters before and 2 after the value.
  const signature = signed ? first.slice(3, -2) : null;
  const rest = signed ? afterType.slice(1) : afterType;

  // Match the asset identity from the end of the path; the public ID may contain
  // slashes, the version segment may precede it, and delivery URLs may carry a
  // format extension when `f_auto` is not the final transformation component.
  const publicIdParts = publicId.split("/");
  const matchesPart = (segment: string, part: string): boolean =>
    segment === part ||
    (!part.includes(".") && segment.startsWith(`${part}.`));
  let matched = 0;
  while (
    matched < publicIdParts.length &&
    matched < rest.length &&
    matchesPart(
      rest[rest.length - 1 - matched],
      publicIdParts[publicIdParts.length - 1 - matched],
    )
  ) {
    matched += 1;
  }
  let end = rest.length - matched;
  if (end > 0 && /^v\d+$/.test(rest[end - 1])) end -= 1;

  return { signature, components: rest.slice(0, end).filter(Boolean) };
}

/**
 * Builds the signed delivery URL for a record's artifact. No network call: the
 * signature is computed locally from the API secret. Callers must follow up with
 * `probeArtifactDelivery()` before reporting a successful artifact.
 */
export function buildVerificationArtifact(
  input: ArtifactInput,
  credentials: ArtifactCredentials,
): VerificationArtifact {
  cloudinary.config({
    cloud_name: credentials.cloudName,
    api_key: credentials.apiKey,
    api_secret: credentials.apiSecret,
    secure: true,
  });

  const url = cloudinary.url(input.publicId, {
    resource_type: input.resourceType,
    type: "upload",
    secure: true,
    sign_url: true,
    transformation: buildTransformation(input),
  });

  const { signature, components } = parseArtifactUrl(url, input.publicId);
  const purposes = artifactPurposes();

  return {
    artifactVersion: ARTIFACT_VERSION,
    recordId: input.recordId,
    publicId: input.publicId,
    resourceType: input.resourceType,
    url,
    signed: signature !== null,
    signature,
    transformation: components.join("/"),
    layers: components.map((parameters, index) => ({
      purpose: purposes[index] ?? "Additional transformation component",
      parameters,
    })),
    canvas: { ...ARTIFACT_CANVAS },
    optimization: { fetchFormat: "auto", quality: "auto" },
    verificationUrl: input.verificationUrl,
  };
}

function parseContentLength(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function headArtifact(
  url: string,
  accept: string,
): Promise<{ status: number; contentType: string | null; contentLength: number | null }> {
  try {
    const response = await fetch(url, { method: "HEAD", headers: { Accept: accept } });
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      contentLength: parseContentLength(response.headers.get("content-length")),
    };
  } catch (error) {
    throw new ArtifactError(
      `Cloudinary delivery could not be reached: ${
        error instanceof Error ? error.message : "unknown transport error"
      }`,
    );
  }
}

/**
 * Confirms that the artifact URL really serves an image before the application
 * reports a generated artifact. Also records what `f_auto` negotiates for a
 * modern browser, which is the honest evidence that optimized delivery is real.
 */
export async function probeArtifactDelivery(
  url: string,
): Promise<ArtifactDelivery> {
  const base = await headArtifact(url, "image/*");
  const isImage = base.contentType?.startsWith("image/") ?? false;
  if (base.status < 200 || base.status >= 300 || !isImage) {
    throw new ArtifactError(
      `Cloudinary did not return a usable artifact (HTTP ${base.status}${
        base.contentType ? `, content-type ${base.contentType}` : ", no content-type"
      }). No artifact was generated.`,
    );
  }

  let negotiated: ArtifactDelivery["negotiated"] = [];
  try {
    const webp = await headArtifact(url, "image/webp,image/*;q=0.8");
    if (webp.status >= 200 && webp.status < 300) {
      negotiated = [
        {
          accept: "image/webp",
          contentType: webp.contentType,
          contentLength: webp.contentLength,
        },
      ];
    }
  } catch {
    // Negotiation evidence is optional; the artifact itself is already verified.
  }

  return {
    verified: true,
    status: base.status,
    contentType: base.contentType,
    contentLength: base.contentLength,
    negotiated,
  };
}
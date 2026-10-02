import assert from "node:assert/strict";
import http from "node:http";
import { describe, test } from "node:test";
import {
  ARTIFACT_CANVAS,
  ARTIFACT_QR,
  ARTIFACT_SIGNATURE_NOTE,
  ARTIFACT_STATUS_COLORS,
  ARTIFACT_VERSION,
  ArtifactError,
  artifactInputFromRecord,
  buildVerificationArtifact,
  formatArtifactTimestamp,
  parseArtifactUrl,
  probeArtifactDelivery,
  type ArtifactCredentials,
  type ArtifactInput,
} from "./artifact.ts";
import type { VerificationRecord } from "@/lib/verification/record";

const CREDENTIALS: ArtifactCredentials = {
  cloudName: "demo-cloud",
  apiKey: "test-api-key",
  apiSecret: "test-api-secret",
};

const RECORD_HASH =
  "fd546eea6cebd095128056bf8e168a28a4d51ed280246bf64e08d2165ee1d988";

const INPUT: ArtifactInput = {
  publicId: "provera/sample-image",
  resourceType: "image",
  status: "REVIEW",
  score: 75,
  recordId: "PV-2026-UHX84W57",
  recordHash: RECORD_HASH,
  engineVersion: "provera-forensic@1",
  timestamp: "2026-10-01T17:17:52.117Z",
  verificationUrl: "http://localhost:3000/api/verify/PV-2026-UHX84W57",
};

function build(input: ArtifactInput = INPUT) {
  return buildVerificationArtifact(input, CREDENTIALS);
}

/**
 * Cloudinary text layers are percent-encoded twice (once by the SDK, once when
 * the URL is built), so a readable layer value needs two decode passes.
 */
function decodeLayer(value: string): string {
  return decodeURIComponent(decodeURIComponent(value));
}

/** Local HTTP server so delivery probing is tested without network access. */
async function startServer(
  handler: (request: http.IncomingMessage) => {
    status: number;
    type: string;
    body: string;
  },
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((request, response) => {
    const { status, type, body } = handler(request);
    response.writeHead(status, {
      "content-type": type,
      "content-length": body.length,
    });
    if (request.method === "HEAD") response.end();
    else response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}/artifact`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("artifact signing", () => {
  test("builds a deterministic signed delivery URL", () => {
    const first = build();
    const second = build();
    assert.equal(first.url, second.url);
    assert.equal(
      first.url.startsWith("https://res.cloudinary.com/demo-cloud/image/upload/"),
      true,
    );
  });

  test("URL carries a Cloudinary signature and never the credentials", () => {
    const artifact = build();
    assert.equal(artifact.signed, true);
    // Cloudinary delivery signatures are URL-safe base64 (may contain - and _).
    assert.match(artifact.signature ?? "", /^[A-Za-z0-9_-]+$/);
    assert.ok(artifact.url.includes(`/s--${artifact.signature}--/`));
    assert.equal(artifact.url.includes(CREDENTIALS.apiSecret), false);
    assert.equal(artifact.url.includes(CREDENTIALS.apiKey), false);
  });

  test("any change to the record changes the transformation and the signature", () => {
    const baseline = build();
    const other = build({ ...INPUT, recordHash: "a".repeat(64) });
    assert.notEqual(other.url, baseline.url);
    assert.notEqual(other.signature, baseline.signature);

    const rescored = build({ ...INPUT, score: 49, status: "FLAGGED" });
    assert.notEqual(rescored.url, baseline.url);
    assert.notEqual(rescored.signature, baseline.signature);
  });

  test("editing the transformation invalidates the signature it was signed with", () => {
    const artifact = build();
    const tampered = artifact.url.replace("REVIEW", "FAKED");
    assert.notEqual(tampered, artifact.url);
    // The signature segment is unchanged while the transformation is not: this
    // is exactly the mismatch Cloudinary detects for restricted delivery.
    assert.ok(tampered.includes(`/s--${artifact.signature}--/`));
    assert.notEqual(tampered, build({ ...INPUT, status: "FLAGGED" }).url);
  });

  test("exposes the delivered transformation, not the asset identity", () => {
    const artifact = build();
    assert.ok(artifact.transformation.includes("f_auto,q_auto"));
    assert.ok(artifact.transformation.includes(`w_${ARTIFACT_CANVAS.width}`));
    assert.ok(artifact.transformation.includes(`h_${ARTIFACT_CANVAS.height}`));
    assert.ok(artifact.transformation.includes("c_pad"));
    assert.equal(artifact.transformation.includes(INPUT.publicId), false);
    assert.ok(artifact.url.includes(INPUT.publicId));
  });
});

describe("artifact layout", () => {
  test("describes every transformation component in delivery order", () => {
    const { layers } = build();
    // canvas + 7 text layers + optimized delivery
    assert.equal(layers.length, 9);
    assert.match(layers[0].purpose, /^Canvas 1200x1200/);
    assert.match(layers[0].parameters, /^b_rgb:0f172a,c_pad/);
    assert.equal(layers[layers.length - 1].parameters, "f_auto,q_auto");
    for (const layer of layers) {
      assert.ok(layer.purpose.length > 0);
      assert.ok(layer.parameters.length > 0);
    }
  });

  test("renders status, score, record ID, short hash, engine and timestamp", () => {
    const decoded = build()
      .layers.map((layer) => decodeLayer(layer.parameters))
      .join("\n");
    assert.ok(decoded.includes("PROVERA"));
    assert.ok(decoded.includes("REVIEW"));
    assert.ok(decoded.includes("Score 75/100"));
    assert.ok(decoded.includes("Record PV-2026-UHX84W57"));
    assert.ok(decoded.includes("Hash fd546eea6cebd095"));
    assert.ok(decoded.includes("Engine provera-forensic@1"));
    assert.ok(decoded.includes("2026-10-01T17:17:52Z"));
    assert.ok(decoded.includes(ARTIFACT_VERSION));
    assert.ok(decoded.includes(INPUT.verificationUrl));
    // Only the short hash is printed: a truncated hash must never be presented
    // as the full record hash.
    assert.equal(decoded.includes(RECORD_HASH), false);
  });

  test("keeps the honest claim boundary on the artifact", () => {
    const decoded = decodeLayer(build().transformation);
    assert.ok(decoded.includes("not proof of authenticity"));
    assert.ok(ARTIFACT_SIGNATURE_NOTE.includes("not access control"));
  });

  test("colours the status per status", () => {
    for (const [status, color] of Object.entries(ARTIFACT_STATUS_COLORS)) {
      const hex = color.replace("#", "");
      const artifact = build({
        ...INPUT,
        status: status as ArtifactInput["status"],
      });
      assert.ok(
        artifact.layers.some((layer) => layer.parameters.includes(`co_rgb:${hex}`)),
        `expected ${status} to use ${color}`,
      );
    }
  });
});

describe("delivery URL parsing", () => {
  test("separates signature, transformation and a slashed public ID", () => {
    const parsed = parseArtifactUrl(
      "https://res.cloudinary.com/demo-cloud/image/upload/s--abc123--/w_100,h_100,c_fill/f_auto/v1790875061/provera/sample-image.jpg",
      "provera/sample-image",
    );
    assert.equal(parsed.signature, "abc123");
    assert.deepEqual(parsed.components, ["w_100,h_100,c_fill", "f_auto"]);
  });

  test("reports no signature for an unsigned delivery URL", () => {
    const parsed = parseArtifactUrl(
      "https://res.cloudinary.com/demo-cloud/image/upload/w_100/v1/provera/sample-image",
      "provera/sample-image",
    );
    assert.equal(parsed.signature, null);
    assert.deepEqual(parsed.components, ["w_100"]);
  });

  test("keeps the asset identity out of the transformation", () => {
    const parsed = parseArtifactUrl(
      "https://res.cloudinary.com/demo-cloud/image/upload/s--abc123--/e_sepia/v1/provera/qyk60bjnnavqpnjwvn89",
      "provera/qyk60bjnnavqpnjwvn89",
    );
    assert.deepEqual(parsed.components, ["e_sepia"]);
    assert.equal(
      parsed.components.some((component) => component.includes("provera")),
      false,
    );
  });
});

describe("QR overlay", () => {
  const QR_INPUT = {
    ...INPUT,
    qrPublicId: "provera/qr-PV-2026-UHX84W57",
  };

  test("adds exactly one QR component before the delivery segment", () => {
    const withoutQr = build();
    const withQr = build(QR_INPUT);
    assert.equal(withoutQr.layers.length, 9);
    assert.equal(withQr.layers.length, 10);
    assert.equal(withQr.hasQr, true);
    assert.equal(withoutQr.hasQr, false);

    const qrLayer = withQr.layers[withQr.layers.length - 2];
    assert.match(qrLayer.purpose, /^QR code to the record's verification page/);
    assert.match(qrLayer.parameters, /^b_rgb:0f172a,c_fit,g_south_west/);
    assert.ok(qrLayer.parameters.includes("l_provera:qr-PV-2026-UHX84W57"));
    assert.ok(qrLayer.parameters.includes(`w_${ARTIFACT_QR.size}`));
    assert.ok(qrLayer.parameters.includes(`x_${ARTIFACT_QR.x}`));
    // Optimized delivery stays last in both variants.
    assert.equal(withQr.layers[withQr.layers.length - 1].parameters, "f_auto,q_auto");
  });

  test("the QR reference stays inside a single URL path segment", () => {
    const { components } = parseArtifactUrl(build(QR_INPUT).url, INPUT.publicId);
    assert.equal(components.length, 10);
    for (const component of components) {
      assert.equal(component.includes("/"), false, `unexpected slash in ${component}`);
    }
  });

  test("adding the QR changes the URL and the signature", () => {
    const withoutQr = build();
    const withQr = build(QR_INPUT);
    assert.notEqual(withQr.url, withoutQr.url);
    assert.notEqual(withQr.signature, withoutQr.signature);
    // Deterministic for the same record.
    assert.equal(build(QR_INPUT).url, withQr.url);
  });

  test("a different QR asset yields a different artifact", () => {
    assert.notEqual(
      build({ ...QR_INPUT, qrPublicId: "provera/qr-PV-2026-OTHERID" }).url,
      build(QR_INPUT).url,
    );
  });
});

describe("record mapping and timestamps", () => {
  const record = {
    recordId: "PV-2026-UHX84W57",
    asset: {
      publicId: "provera/sample-image",
      resourceType: "image",
      format: "jpg",
      version: 1790875061,
    },
    score: 75,
    status: "REVIEW",
    timestamp: "2026-10-01T17:17:52.117Z",
    engineVersion: "provera-forensic@1",
    recordHash: RECORD_HASH,
  } as unknown as VerificationRecord;

  test("maps a stored record to artifact inputs", () => {
    const input = artifactInputFromRecord(record, {
      verificationUrl: "http://localhost:3000/verify/PV-2026-UHX84W57",
    });
    assert.equal(input.publicId, record.asset.publicId);
    assert.equal(input.status, "REVIEW");
    assert.equal(input.score, 75);
    assert.equal(input.recordHash, RECORD_HASH);
    assert.equal(
      input.verificationUrl,
      "http://localhost:3000/verify/PV-2026-UHX84W57",
    );
    assert.equal(input.qrPublicId, undefined);
  });

  test("carries the QR public ID when one is supplied", () => {
    const input = artifactInputFromRecord(record, {
      verificationUrl: "http://localhost:3000/verify/PV-2026-UHX84W57",
      qrPublicId: "provera/qr-PV-2026-UHX84W57",
    });
    assert.equal(input.qrPublicId, "provera/qr-PV-2026-UHX84W57");
  });

  test("trims sub-second precision from the artifact timestamp", () => {
    assert.equal(formatArtifactTimestamp("2026-10-01T17:17:52.117Z"), "2026-10-01T17:17:52Z");
    assert.equal(formatArtifactTimestamp("2026-10-01T17:17:52Z"), "2026-10-01T17:17:52Z");
    assert.equal(formatArtifactTimestamp("not-a-timestamp"), "not-a-timestamp");
  });
});

describe("delivery verification", () => {
  test("accepts an image response and records what f_auto negotiated", async () => {
    const server = await startServer((request) => {
      const accept = request.headers.accept ?? "";
      const webp = accept.includes("image/webp");
      return {
        status: 200,
        type: webp ? "image/webp" : "image/jpeg",
        body: "artifact-bytes",
      };
    });
    try {
      const delivery = await probeArtifactDelivery(server.url);
      assert.equal(delivery.verified, true);
      assert.equal(delivery.status, 200);
      assert.equal(delivery.contentType, "image/jpeg");
      assert.equal(delivery.contentLength, 14);
      assert.equal(delivery.negotiated.length, 1);
      assert.equal(delivery.negotiated[0].contentType, "image/webp");
    } finally {
      await server.close();
    }
  });

  test("refuses a non-image response instead of reporting an artifact", async () => {
    const server = await startServer(() => ({
      status: 200,
      type: "text/html",
      body: "<html>error</html>",
    }));
    try {
      await assert.rejects(
        () => probeArtifactDelivery(server.url),
        (error: unknown) =>
          error instanceof ArtifactError &&
          error.message.includes("No artifact was generated"),
      );
    } finally {
      await server.close();
    }
  });

  test("refuses a failing delivery response", async () => {
    const server = await startServer(() => ({
      status: 404,
      type: "text/plain",
      body: "Not found",
    }));
    try {
      await assert.rejects(
        () => probeArtifactDelivery(server.url),
        (error: unknown) => error instanceof ArtifactError,
      );
    } finally {
      await server.close();
    }
  });

  test("reports a transport failure as an artifact error", async () => {
    await assert.rejects(
      () => probeArtifactDelivery("http://127.0.0.1:9/never-listens"),
      (error: unknown) =>
        error instanceof ArtifactError &&
        error.message.includes("could not be reached"),
    );
  });
});
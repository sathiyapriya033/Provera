import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AUDIT_STATUSES,
  DEFAULT_AUDIT_LIMIT,
  MAX_AUDIT_LIMIT,
  auditCloudinarySort,
  auditSearchExpression,
  isUnfiltered,
  matchesAuditFilters,
  parseAuditQuery,
  readProveraMetadata,
  sortAuditRows,
  sortAuthority,
  toAuditRow,
  type AuditQuery,
  type AuditRow,
} from "./query.ts";

const RECORD_ID = "PV-2026-ABCDEFGH";

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    provera_record_id: RECORD_ID,
    provera_status: "REVIEW",
    provera_score: 75,
    provera_record_hash: "a".repeat(64),
    provera_timestamp: "2026-03-04T05:06:07.000Z",
    provera_version: "provera-forensic@1",
    provera_flags: "unavailable:ocrClaim,unavailable:duplicate",
    ...overrides,
  };
}

function query(overrides: Partial<AuditQuery> = {}): AuditQuery {
  return {
    status: null,
    minScore: null,
    maxScore: null,
    cursor: null,
    limit: DEFAULT_AUDIT_LIMIT,
    sort: "newest",
    ...overrides,
  };
}

describe("parseAuditQuery", () => {
  test("returns an unfiltered query for empty parameters", () => {
    const { query: parsed, rejected } = parseAuditQuery({});
    assert.equal(parsed.status, null);
    assert.equal(parsed.minScore, null);
    assert.equal(parsed.maxScore, null);
    assert.equal(parsed.cursor, null);
    assert.equal(parsed.limit, DEFAULT_AUDIT_LIMIT);
    assert.equal(parsed.sort, "newest");
    assert.deepEqual(rejected, []);
    assert.equal(isUnfiltered(parsed), true);
  });

  test("accepts a status case-insensitively", () => {
    for (const status of AUDIT_STATUSES) {
      const { query: parsed, rejected } = parseAuditQuery({ status: status.toLowerCase() });
      assert.equal(parsed.status, status);
      assert.deepEqual(rejected, []);
    }
  });

  test("rejects an unknown status and says why", () => {
    const { query: parsed, rejected } = parseAuditQuery({ status: "APPROVED" });
    assert.equal(parsed.status, null);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].field, "status");
    assert.equal(rejected[0].value, "APPROVED");
    assert.match(rejected[0].reason, /VERIFIED/);
  });

  test("accepts a score range and reports it as filtered", () => {
    const { query: parsed, rejected } = parseAuditQuery({ minScore: "40", maxScore: "90" });
    assert.equal(parsed.minScore, 40);
    assert.equal(parsed.maxScore, 90);
    assert.deepEqual(rejected, []);
    assert.equal(isUnfiltered(parsed), false);
  });

  test("rejects a non-numeric or out-of-range score", () => {
    const { query: parsed, rejected } = parseAuditQuery({ minScore: "abc", maxScore: "101" });
    assert.equal(parsed.minScore, null);
    assert.equal(parsed.maxScore, null);
    assert.equal(rejected.length, 2);
    assert.ok(rejected.every((entry) => entry.reason.includes("0 and 100")));
  });

  test("drops maxScore when it is below minScore instead of matching nothing", () => {
    const { query: parsed, rejected } = parseAuditQuery({ minScore: "80", maxScore: "20" });
    assert.equal(parsed.minScore, 80);
    assert.equal(parsed.maxScore, null);
    assert.equal(rejected[0].field, "maxScore");
    assert.match(rejected[0].reason, /minScore \(80\)/);
  });

  test("rejects a forged cursor instead of sending it to Cloudinary", () => {
    const { query: parsed, rejected } = parseAuditQuery({
      cursor: "not a cursor&drop=table",
    });
    assert.equal(parsed.cursor, null);
    assert.equal(rejected[0].field, "cursor");
  });

  test("accepts a real cursor and bounds its length", () => {
    const good = parseAuditQuery({ cursor: "fea09406c5358915d36f0257d80f04f12" });
    assert.equal(good.query.cursor, "fea09406c5358915d36f0257d80f04f12");
    assert.deepEqual(good.rejected, []);
    assert.equal(parseAuditQuery({ cursor: "a".repeat(600) }).query.cursor, null);
  });

  test("bounds the page size and falls back to the default", () => {
    assert.equal(parseAuditQuery({ limit: "10" }).query.limit, 10);
    assert.equal(parseAuditQuery({ limit: String(MAX_AUDIT_LIMIT) }).query.limit, MAX_AUDIT_LIMIT);
    const tooBig = parseAuditQuery({ limit: "5000" });
    assert.equal(tooBig.query.limit, DEFAULT_AUDIT_LIMIT);
    assert.equal(tooBig.rejected[0].field, "limit");
  });

  test("rejects an unknown sort order and keeps the default", () => {
    const { query: parsed, rejected } = parseAuditQuery({ sort: "sideways" });
    assert.equal(parsed.sort, "newest");
    assert.equal(rejected[0].field, "sort");
  });

  test("takes the first value when a parameter is repeated", () => {
    assert.equal(parseAuditQuery({ status: ["VERIFIED", "FLAGGED"] }).query.status, "VERIFIED");
  });

  test("treats an empty value as unset", () => {
    const { query: parsed, rejected } = parseAuditQuery({
      status: "  ",
      minScore: "",
      cursor: "",
    });
    assert.deepEqual(rejected, []);
    assert.equal(parsed.status, null);
    assert.equal(parsed.minScore, null);
    assert.equal(parsed.cursor, null);
  });
});

describe("readProveraMetadata", () => {
  test("reads a complete record", () => {
    const read = readProveraMetadata(metadata());
    assert.equal(read?.recordId, RECORD_ID);
    assert.equal(read?.status, "REVIEW");
    assert.equal(read?.score, 75);
    assert.deepEqual(read?.flags, ["unavailable:ocrClaim", "unavailable:duplicate"]);
  });

  test("returns null for an asset that is not a verification record", () => {
    assert.equal(readProveraMetadata({}), null);
    assert.equal(readProveraMetadata({ provera_status: "REVIEW" }), null);
    assert.equal(readProveraMetadata(null), null);
    assert.equal(readProveraMetadata("PV-2026-ABCDEFGH"), null);
    assert.equal(readProveraMetadata([{ provera_record_id: RECORD_ID }]), null);
  });

  test("rejects a malformed record ID rather than returning a broken row", () => {
    assert.equal(readProveraMetadata(metadata({ provera_record_id: "PV-1" })), null);
    assert.equal(readProveraMetadata(metadata({ provera_record_id: "totally-wrong" })), null);
  });

  test("accepts a score returned as a string", () => {
    assert.equal(readProveraMetadata(metadata({ provera_score: "75" }))?.score, 75);
  });

  test("treats a missing score as unknown, not zero", () => {
    assert.equal(readProveraMetadata(metadata({ provera_score: undefined }))?.score, null);
  });

  test("an empty flag string is an empty list, not one empty flag", () => {
    assert.deepEqual(readProveraMetadata(metadata({ provera_flags: "" }))?.flags, []);
  });
});

describe("filtering", () => {
  test("keeps everything when no filter is set", () => {
    const read = readProveraMetadata(metadata());
    assert.ok(read);
    assert.equal(matchesAuditFilters(read, query()), true);
  });

  test("a status filter matches exactly", () => {
    const read = readProveraMetadata(metadata());
    assert.ok(read);
    assert.equal(matchesAuditFilters(read, query({ status: "REVIEW" })), true);
    assert.equal(matchesAuditFilters(read, query({ status: "VERIFIED" })), false);
  });

  test("applies an inclusive score range", () => {
    const read = readProveraMetadata(metadata());
    assert.ok(read);
    assert.equal(matchesAuditFilters(read, query({ minScore: 75, maxScore: 75 })), true);
    assert.equal(matchesAuditFilters(read, query({ minScore: 76 })), false);
    assert.equal(matchesAuditFilters(read, query({ maxScore: 74 })), false);
  });

  test("a record with no score cannot satisfy a score filter", () => {
    const read = readProveraMetadata(metadata({ provera_score: undefined }));
    assert.ok(read);
    assert.equal(read.score, null);
    assert.equal(matchesAuditFilters(read, query({ minScore: 0 })), false);
    assert.equal(matchesAuditFilters(read, query({ maxScore: 100 })), false);
    assert.equal(matchesAuditFilters(read, query({ status: "REVIEW" })), true);
  });

  test("a record with no status cannot satisfy a status filter", () => {
    const read = readProveraMetadata(metadata({ provera_status: undefined }));
    assert.ok(read);
    assert.equal(matchesAuditFilters(read, query({ status: "REVIEW" })), false);
  });
});


describe("row mapping and ordering", () => {
  const resource = {
    public_id: "provera/example",
    asset_id: "043a426237357c022b9a8edaf92b7f1a",
    secure_url: "https://res.cloudinary.com/demo/image/upload/v1/provera/example.jpg",
    format: "jpg",
    bytes: 109669,
    width: 864,
    height: 576,
    created_at: "2026-03-04T05:06:00Z",
    metadata: metadata(),
  };

  test("maps a search result to a queue row", () => {
    const row = toAuditRow(resource);
    assert.equal(row?.recordId, RECORD_ID);
    assert.equal(row?.publicId, "provera/example");
    assert.equal(row?.bytes, 109669);
    assert.equal(row?.verifiedAt, "2026-03-04T05:06:07.000Z");
    assert.equal(row?.engineVersion, "provera-forensic@1");
  });

  test("a QR image or plain upload maps to no row", () => {
    assert.equal(toAuditRow({ public_id: "provera/qr-PV-2026-ABCDEFGH" }), null);
    assert.equal(toAuditRow({}), null);
  });

  test("a missing field is null rather than a fabricated zero", () => {
    const row = toAuditRow({ public_id: "x", metadata: metadata() });
    assert.equal(row?.bytes, null);
    assert.equal(row?.width, null);
  });

  function row(recordId: string, score: number | null): AuditRow {
    return {
      recordId,
      publicId: `provera/${recordId}`,
      assetId: null,
      secureUrl: null,
      format: null,
      bytes: null,
      width: null,
      height: null,
      uploadedAt: null,
      status: "REVIEW",
      score,
      recordHash: null,
      verifiedAt: null,
      engineVersion: null,
      flags: [],
    };
  }

  test("orders by score in both directions", () => {
    const rows = [
      row("PV-2026-AAAAAAAA", 40),
      row("PV-2026-BBBBBBBB", 90),
      row("PV-2026-CCCCCCCC", 65),
    ];
    assert.deepEqual(
      sortAuditRows(rows, "score_desc").map((r) => r.score),
      [90, 65, 40],
    );
    assert.deepEqual(
      sortAuditRows(rows, "score_asc").map((r) => r.score),
      [40, 65, 90],
    );
  });

  test("a record with no score sorts last, never first", () => {
    const rows = [row("PV-2026-AAAAAAAA", null), row("PV-2026-BBBBBBBB", 95)];
    assert.deepEqual(
      sortAuditRows(rows, "score_desc").map((r) => r.score),
      [95, null],
    );
    assert.deepEqual(
      sortAuditRows(rows, "score_asc").map((r) => r.score),
      [95, null],
    );
  });

  test("date sorts leave the order to Cloudinary", () => {
    const rows = [row("PV-2026-AAAAAAAA", 40), row("PV-2026-BBBBBBBB", 90)];
    assert.deepEqual(sortAuditRows(rows, "newest"), rows);
    assert.deepEqual(sortAuditRows(rows, "oldest"), rows);
  });

  test("sorting does not mutate the caller's array", () => {
    const rows = [row("PV-2026-AAAAAAAA", 40), row("PV-2026-BBBBBBBB", 90)];
    sortAuditRows(rows, "score_desc");
    assert.equal(rows[0].score, 40);
  });
});

describe("search parameters", () => {
  test("queries every image in the account", () => {
    assert.equal(auditSearchExpression(), "resource_type:image");
  });

  test("Cloudinary orders by created_at", () => {
    assert.equal(auditCloudinarySort("newest"), "desc");
    assert.equal(auditCloudinarySort("oldest"), "asc");
    assert.equal(auditCloudinarySort("score_desc"), "desc");
  });

  test("states which side decides the order", () => {
    assert.equal(sortAuthority("newest"), "cloudinary");
    assert.equal(sortAuthority("oldest"), "cloudinary");
    assert.equal(sortAuthority("score_desc"), "application");
    assert.equal(sortAuthority("score_asc"), "application");
  });
});


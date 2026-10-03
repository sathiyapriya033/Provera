import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  AUDIT_SORTS,
  AUDIT_STATUSES,
  DEFAULT_AUDIT_LIMIT,
  MAX_AUDIT_LIMIT,
  isUnfiltered,
  parseAuditQuery,
  sortAuthority,
  type AuditQuery,
  type AuditQueryRejection,
  type AuditRow,
} from "@/lib/audit/query";
import { AuditQueryError, searchAuditQueueFromEnv, type AuditResult } from "@/lib/cloudinary/audit";
import { CloudinaryConfigError } from "@/lib/cloudinary/config";

/**
 * Audit queue (Phase 8): the searchable list of verifications, backed entirely by
 * Cloudinary.
 *
 * There is no queue database. Every row is a Cloudinary asset whose `provera_*`
 * structured metadata is read during the request, so the queue reflects the
 * account rather than a second copy of it. The status and score filters are
 * applied to that metadata in the application, because this account's Search API
 * cannot filter on structured metadata fields (measured, docs/CLOUDINARY.md); the
 * page says so instead of implying Cloudinary did the work.
 *
 * `force-dynamic` is required: the queue is read from the live account on every
 * request and must never be cached.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Provera — audit queue",
  description:
    "Search the verification records held in Cloudinary by status and Forensic Consistency Score.",
};

const SORT_LABELS: Record<(typeof AUDIT_SORTS)[number], string> = {
  newest: "Newest upload first",
  oldest: "Oldest upload first",
  score_desc: "Highest score first",
  score_asc: "Lowest score first",
};

const STATUS_TONE: Record<string, string> = {
  VERIFIED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  REVIEW: "border-amber-200 bg-amber-50 text-amber-800",
  FLAGGED: "border-red-200 bg-red-50 text-red-800",
};

/** Builds a queue URL that keeps the current filters and swaps the cursor. */
function queueHref(query: AuditQuery, cursor: string | null): string {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.minScore !== null) params.set("minScore", String(query.minScore));
  if (query.maxScore !== null) params.set("maxScore", String(query.maxScore));
  if (query.sort !== "newest") params.set("sort", query.sort);
  if (query.limit !== DEFAULT_AUDIT_LIMIT) params.set("limit", String(query.limit));
  if (cursor) params.set("cursor", cursor);
  const search = params.toString();
  return search ? `/audit?${search}` : "/audit";
}

function FilterForm({ query }: { query: AuditQuery }) {
  const input =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900";
  return (
    <form method="get" className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
          </span>
          <select name="status" defaultValue={query.status ?? ""} className={input}>
            <option value="">Any status</option>
            {AUDIT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Min score
          </span>
          <input
            name="minScore"
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            defaultValue={query.minScore ?? ""}
            placeholder="0"
            className={input}
          />
        </label>
        <label>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Max score
          </span>
          <input
            name="maxScore"
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            defaultValue={query.maxScore ?? ""}
            placeholder="100"
            className={input}
          />
        </label>
        <label>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sort
          </span>
          <select name="sort" defaultValue={query.sort} className={input}>
            {AUDIT_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Per page
          </span>
          <input
            name="limit"
            type="number"
            min={1}
            max={MAX_AUDIT_LIMIT}
            inputMode="numeric"
            defaultValue={query.limit}
            className={input}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Apply filters
        </button>
        <Link href="/audit" className="text-sm font-medium text-slate-600 underline">
          Clear
        </Link>
        <span className="text-xs text-slate-500">
          Filters are applied by Provera to the structured metadata Cloudinary returns
          for this page of results.
        </span>
      </div>
    </form>
  );
}

function RejectedFilters({ rejected }: { rejected: AuditQueryRejection[] }) {
  if (rejected.length === 0) return null;
  return (
    <ul className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      {rejected.map((entry) => (
        <li key={`${entry.field}-${entry.value}`}>
          <span className="font-mono">{entry.value}</span> was ignored for{" "}
          <span className="font-medium">{entry.field}</span>: {entry.reason}.
        </li>
      ))}
    </ul>
  );
}


function ScoreCell({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="text-xs text-slate-500">not recorded</span>;
  }
  const tone =
    score >= 80
      ? "text-emerald-700"
      : score >= 50
        ? "text-amber-700"
        : "text-red-700";
  return (
    <span className={`font-mono text-sm font-semibold ${tone}`}>
      {score}
      <span className="text-slate-400">/100</span>
    </span>
  );
}

function QueueTable({ rows }: { rows: AuditRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[52rem] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">Asset</th>
            <th className="px-3 py-2 font-semibold">Record</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Score</th>
            <th className="px-3 py-2 font-semibold">Verified at</th>
            <th className="px-3 py-2 font-semibold">Flags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.recordId} className="border-b border-slate-100 align-top last:border-b-0">
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  {row.secureUrl ? (
                    <Image
                      src={row.secureUrl}
                      alt={`Asset ${row.publicId}`}
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded border border-slate-200 object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded border border-slate-200 bg-slate-50 text-[10px] text-slate-400">
                      no image
                    </span>
                  )}
                  <span className="break-all font-mono text-[11px] text-slate-500">
                    {row.publicId}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2">
                <Link
                  href={`/verify/${row.recordId}`}
                  className="font-mono text-xs font-medium text-slate-900 underline underline-offset-2 hover:text-slate-600"
                >
                  {row.recordId}
                </Link>
                <br />
                <Link
                  href={`/inspector?recordId=${row.recordId}`}
                  className="text-[11px] text-slate-500 underline underline-offset-2 hover:text-slate-800"
                >
                  Inspect in Cloudinary
                </Link>
              </td>
              <td className="px-3 py-2">
                {row.status ? (
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[row.status] ?? "border-slate-200 bg-slate-100 text-slate-600"}`}
                  >
                    {row.status}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">not recorded</span>
                )}
              </td>
              <td className="px-3 py-2">
                <ScoreCell score={row.score} />
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                {row.verifiedAt ?? <span className="font-sans text-slate-400">not recorded</span>}
              </td>
              <td className="px-3 py-2">
                {row.flags.length === 0 ? (
                  <span className="text-xs text-slate-500">none</span>
                ) : (
                  <ul className="space-y-0.5">
                    {row.flags.map((flag) => (
                      <li
                        key={flag}
                        className={`font-mono text-[10px] ${
                          flag.startsWith("concern:")
                            ? "text-red-700"
                            : "text-slate-500"
                        }`}
                      >
                        {flag}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function ResultSummary({ result, query }: { result: AuditResult; query: AuditQuery }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
      <span>
        <span className="font-semibold text-slate-900">{result.matched}</span> of{" "}
        <span className="font-semibold text-slate-900">{result.scanned}</span> assets on
        this page {isUnfiltered(query) ? "are verification records" : "match the filters"}.
      </span>
      {result.withoutRecordMetadata > 0 && (
        <span>
          {result.withoutRecordMetadata} carried no Provera metadata and are not listed
          (uploads and QR images).
        </span>
      )}
      <span>Cloudinary holds {result.cloudinaryTotal} image assets in total.</span>
      <span>
        Sorting by{" "}
        {sortAuthority(query.sort) === "cloudinary"
          ? "Cloudinary's index"
          : "Provera, over the retrieved metadata"}
        .
      </span>
    </div>
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { query, rejected } = parseAuditQuery(params);

  let result: AuditResult;
  try {
    result = await searchAuditQueueFromEnv(query);
  } catch (error) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
        <AuditHeader />
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <h2 className="font-semibold">
            {error instanceof CloudinaryConfigError
              ? "Cloudinary is not configured"
              : "The audit queue could not be read"}
          </h2>
          <p className="mt-2">
            {error instanceof CloudinaryConfigError
              ? error.message
              : error instanceof AuditQueryError
                ? error.message
                : "An unexpected error occurred while reading the queue."}
          </p>
          <p className="mt-2">
            The queue is read live from the Cloudinary account, so it cannot be shown
            when that read fails. No results are cached or displayed from a previous
            request.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <AuditHeader />

      <div className="mt-6 space-y-4">
        <FilterForm query={query} />
        <RejectedFilters rejected={rejected} />
        <ResultSummary result={result} query={query} />

        {result.rows.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
            <p className="font-medium text-slate-800">No matching verification records.</p>
            {result.pageExhaustedWithoutMatch ? (
              <p className="mt-2">
                No record on this page matches, but Cloudinary has more assets to scan.
                Because the filters run in Provera after retrieval, matching records may
                be on a later page.
              </p>
            ) : (
              <p className="mt-2">
                Nothing on this page matched. Clear the filters, or run a verification on
                the main page to create a record.
              </p>
            )}
          </div>
        ) : (
          <QueueTable rows={result.rows} />
        )}

        <div className="flex flex-wrap items-center gap-3">
          {result.nextCursor ? (
            <Link
              href={queueHref(query, result.nextCursor)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Next page
            </Link>
          ) : (
            <span className="text-xs text-slate-500">
              This is the last page Cloudinary returned.
            </span>
          )}
          {query.cursor && (
            <Link href={queueHref(query, null)} className="text-sm text-slate-600 underline">
              Back to the first page
            </Link>
          )}
        </div>
      </div>

      <p className="mt-10 border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-500">
        The queue is a view over Cloudinary, not a second store: a row exists only
        while the asset and its <span className="font-mono">provera_*</span> metadata
        exist in the account. A record that was deleted from Cloudinary simply
        disappears from the queue. Consistency between a row and the stored record is
        a separate question, answered by{" "}
        <Link href="/inspector" className="underline">
          Inspector Mode
        </Link>
        .
      </p>
    </main>
  );
}

function AuditHeader() {
  return (
    <>
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
        Audit queue
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        Verification records in Cloudinary
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
        Every verification Provera writes attaches a{" "}
        <span className="font-mono">provera_record_id</span>, status and score to its
        Cloudinary asset as structured metadata. This queue reads those values back from
        the account, so there is no separate database to keep in step.
      </p>
    </>
  );
}


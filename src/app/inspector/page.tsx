import type { Metadata } from "next";
import Link from "next/link";
import { CloudinaryConfigError } from "@/lib/cloudinary/config";
import InspectionReportView from "@/components/inspection/inspection-report";
import { PageShell } from "@/components/site/site-footer";
import { collectInspection } from "@/lib/inspection/collect";
import type { InspectionReport } from "@/lib/inspection/inspect";
import { RECORD_ID_PATTERN } from "@/lib/verification/record";
import { VerificationStoreError, listRecentRecords } from "@/lib/verification/store";

/**
 * Inspector Mode (Phase 7): the Cloudinary integration inspection view.
 *
 * Shows the live Cloudinary state of a verified asset next to the record that
 * describes it — asset identity, the structured metadata Provera wrote, the
 * artifact transformation with its signature and optimization parameters, and
 * the generated derivatives.
 *
 * `force-dynamic` is required: the report is read from Cloudinary and the local
 * record store on every request, so it must never be prerendered or cached.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Provera — Inspector",
  description:
    "Inspect the live Cloudinary account state behind a verification record: asset identity, structured metadata, transformation, signed URL and generated derivatives.",
};

function Message({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "warn" | "bad";
  children: React.ReactNode;
}) {
  const className =
    tone === "bad"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className={`rounded-lg border p-4 text-sm ${className}`}>
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-2 leading-relaxed">{children}</div>
    </div>
  );
}

async function RecordPicker() {
  let records: Awaited<ReturnType<typeof listRecentRecords>> = [];
  let failure: string | null = null;
  try {
    records = await listRecentRecords();
  } catch (error) {
    failure = error instanceof Error ? error.message : "The record store is unreadable.";
  }

  return (
    <PageShell active="/inspector">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm font-medium text-blue-700">Inspector</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Inspect the Cloudinary workflow
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Pick a verification record to see the live Cloudinary state behind it: the
        asset identity, the structured metadata Provera wrote, the artifact
        transformation with its signature and optimization parameters, the QR
        overlay source, and the derivatives Cloudinary generated. Every value shown
        is read from Cloudinary when you open this page.
      </p>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[16rem]">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Record ID
          </span>
          <input
            name="recordId"
            placeholder="PV-2026-XXXXXXXX"
            pattern={RECORD_ID_PATTERN.source.slice(1, -1)}
            required
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Inspect
        </button>
      </form>
      <p className="mt-2 text-xs text-slate-500">
        A record ID has the form <span className="font-mono">PV-YYYY-XXXXXXXX</span>.
      </p>

      <section className="mt-10" aria-label="Recent records">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recent records on this server
        </h2>
        {failure ? (
          <p className="mt-3 text-sm text-slate-600">{failure}</p>
        ) : records.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            No records are stored on this server yet. Run a verification on the main
            page first.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {records.map((record) => (
              <li key={record.recordId}>
                <Link
                  href={`/inspector?recordId=${encodeURIComponent(record.recordId)}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 hover:bg-slate-50"
                >
                  <span className="font-mono text-sm text-slate-900">
                    {record.recordId}
                  </span>
                  <span className="text-xs text-slate-500">
                    {record.status} · score {record.score} · {record.timestamp}
                  </span>
                  <span className="w-full break-all font-mono text-[11px] text-slate-400">
                    {record.publicId}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10 border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-500">
        Inspector Mode is a transparency view. It shows what Cloudinary currently
        holds for an asset and how it compares with Provera&apos;s record. It does
        not prove that a photograph is authentic, and it reports mismatches rather
        than repairing them.
      </p>
    </div>
    </PageShell>
  );
}


/**
 * Runs the inspection and classifies the outcome. Kept free of JSX so the page
 * renders a discriminated union instead of building elements inside a catch
 * block, where React would not catch render-time errors anyway.
 */
type InspectionOutcome =
  | { kind: "ok"; report: InspectionReport }
  | { kind: "record-not-found"; message: string }
  | { kind: "not-configured"; message: string }
  | { kind: "failed" };

async function loadInspection(recordId: string): Promise<InspectionOutcome> {
  try {
    return { kind: "ok", report: await collectInspection(recordId) };
  } catch (error) {
    if (error instanceof VerificationStoreError && error.code === "RECORD_NOT_FOUND") {
      return { kind: "record-not-found", message: error.message };
    }
    if (error instanceof CloudinaryConfigError) {
      return { kind: "not-configured", message: error.message };
    }
    console.error(
      "Unexpected inspector error:",
      error instanceof Error ? error.message : "non-Error object (contents suppressed)",
    );
    return { kind: "failed" };
  }
}

export default async function InspectorPage({
  searchParams,
}: {
  searchParams: Promise<{ recordId?: string | string[] }>;
}) {
  const { recordId: rawRecordId } = await searchParams;
  const recordId = Array.isArray(rawRecordId) ? rawRecordId[0] : rawRecordId;

  if (!recordId || recordId.trim() === "") {
    return <RecordPicker />;
  }

  const trimmed = recordId.trim();

  if (!RECORD_ID_PATTERN.test(trimmed)) {
    return (
      <PageShell active="/inspector">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <Message title="Invalid record ID" tone="warn">
          <p>
            <span className="font-mono">{trimmed}</span> is not a Provera record ID.
            A record ID has the form <span className="font-mono">PV-YYYY-XXXXXXXX</span>.
          </p>
          <p className="mt-3">
            <Link href="/inspector" className="font-medium underline">
              Choose a record
            </Link>
          </p>
        </Message>
      </div>
    </PageShell>
    );
  }

  const outcome = await loadInspection(trimmed);

  if (outcome.kind === "ok") {
    return (
      <PageShell active="/inspector">
        <InspectionReportView report={outcome.report} />
      </PageShell>
    );
  }

  if (outcome.kind === "record-not-found") {
    return (
      <PageShell active="/inspector">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <Message title="Record not found" tone="warn">
          <p>{outcome.message}</p>
          <p className="mt-3">
            Records are stored on the server that created them, so an ID from another
            deployment or from before a redeploy will not be here. Nothing is inferred
            from a missing record: it is reported as unknown, never as a passed or
            failed verification.
          </p>
          <p className="mt-3">
            <Link href="/inspector" className="font-medium underline">
              Choose a record
            </Link>
          </p>
        </Message>
      </div>
    </PageShell>
    );
  }

  if (outcome.kind === "not-configured") {
    return (
      <PageShell active="/inspector">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <Message title="Cloudinary is not configured" tone="bad">
          <p>{outcome.message}</p>
          <p className="mt-3">
            Inspector Mode reads the live account, so it cannot run without these
            credentials. No Cloudinary value is shown when they are missing.
          </p>
        </Message>
      </div>
    </PageShell>
    );
  }

  return (
    <PageShell active="/inspector">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <Message title="Inspection failed" tone="bad">
        <p>
          The record could not be inspected because of an unexpected server error. No
          Cloudinary values are shown for this request, and nothing has been reported as
          verified.
        </p>
        <p className="mt-3">
          <Link href="/inspector" className="font-medium underline">
            Back to the record picker
          </Link>
        </p>
      </Message>
    </div>
    </PageShell>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  COMPONENT_LABELS,
  ENGINE_WEIGHTS,
  type ComponentKey,
} from "@/lib/forensic/engine";
import {
  RECORD_ID_PATTERN,
  computeRecordHash,
  type VerificationRecord,
} from "@/lib/verification/record";
import { VerificationStoreError, getRecord } from "@/lib/verification/store";

/**
 * Public verification page (Phase 6): the destination of the artifact's QR code.
 *
 * It answers one question honestly — what did Provera record and assess for this
 * asset at that moment — and never implies that the photograph itself has been
 * proven authentic. No login, no credentials: the page reads the same record that
 * the application stored, and it recomputes the integrity hash so a reader can
 * see whether the record still matches itself.
 *
 * `force-dynamic` is required: records live in the local store and change while
 * the server runs, so this route must never be prerendered or cached.
 */
export const dynamic = "force-dynamic";

const SIGNAL_DISPLAY: readonly {
  slot: keyof VerificationRecord["signals"];
  component: ComponentKey;
}[] = [
  { slot: "metadataAvailability", component: "metadata" },
  { slot: "ocrConsistency", component: "ocrClaim" },
  { slot: "visualConsistency", component: "visualContent" },
  { slot: "duplicateIndicator", component: "duplicate" },
  { slot: "mediaQuality", component: "mediaQuality" },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ recordId: string }>;
}): Promise<Metadata> {
  const { recordId } = await params;
  return {
    title: `Provera — verification record ${recordId}`,
    description:
      "What Provera recorded and assessed for this asset at the time of verification.",
  };
}

function formatTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime())
    ? timestamp
    : `${parsed.toUTCString()} (${timestamp})`;
}

function StatusPill({ status }: { status: VerificationRecord["status"] }) {
  const className =
    status === "VERIFIED"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "REVIEW"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-800";
  return (
    <span
      className={`rounded-full border px-3 py-1 text-sm font-semibold ${className}`}
    >
      {status}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 py-1.5 last:border-b-0">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="break-all font-mono text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function InvalidRecordState({ recordId }: { recordId: string }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Invalid record ID
      </h1>
      <p className="mt-3 text-sm text-slate-700">
        <span className="font-mono">{recordId}</span> is not a Provera record ID.
        A record ID has the form <span className="font-mono">PV-YYYY-XXXXXXXX</span>.
      </p>
      <p className="mt-4 text-sm text-slate-600">
        Check the link or scan the QR code on the verification artifact again.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Start a verification
      </Link>
    </main>
  );
}

function RetrievalErrorState() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Record could not be read
      </h1>
      <p className="mt-3 text-sm text-slate-700">
        The verification record store could not be read on this server. No record
        is shown, because an unverified record must not be presented as a result.
      </p>
      <p className="mt-4 text-sm text-slate-600">
        Please try again later, or ask the person who shared this record for a new
        link.
      </p>
    </main>
  );
}

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  const { recordId } = await params;

  if (!RECORD_ID_PATTERN.test(recordId)) {
    return <InvalidRecordState recordId={recordId} />;
  }

  let record: VerificationRecord | null = null;
  let missing = false;
  try {
    record = await getRecord(recordId);
  } catch (error) {
    missing =
      error instanceof VerificationStoreError && error.code === "RECORD_NOT_FOUND";
  }

  if (!record) {
    if (missing) notFound();
    return <RetrievalErrorState />;
  }

  // Recompute the hash from the stored data instead of trusting the stored value.
  const integrityVerified = computeRecordHash(record) === record.recordHash;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-sm font-medium text-blue-700">Provera</p>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Verification record
        </p>
        <h1 className="mt-1 break-all font-mono text-2xl font-medium tracking-tight text-slate-900">
          {record.recordId}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <StatusPill status={record.status} />
          <p className="text-sm text-slate-600">
            Consistency score{" "}
            <span className="font-mono text-base font-medium text-slate-900">
              {record.score}
            </span>
            <span className="text-slate-500">/100</span>
          </p>
          <p className="text-xs text-slate-500">coverage {record.coverage}%</p>
        </div>
        <p className="mt-4 border-l-2 border-slate-200 pl-3 text-xs leading-relaxed text-slate-600">
          This page shows what Provera recorded and assessed for this asset at the
          moment of verification. The score is a documented consistency heuristic,
          not a probability of fraud, and nothing here proves that the photograph
          is authentic.
        </p>
      </header>

      {!integrityVerified && (
        <p
          role="alert"
          className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          Warning: the stored record no longer matches its own hash. Treat this
          record as altered and do not rely on it.
        </p>
      )}

      <section className="mt-6" aria-label="Media asset">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Media asset
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
          {record.asset.secureUrl && (
            <div className="overflow-hidden rounded border border-slate-200 bg-slate-50">
              <Image
                src={record.asset.secureUrl}
                alt={`Asset ${record.asset.publicId} recorded in this verification`}
                width={1200}
                height={900}
                className="h-auto w-full object-cover"
              />
            </div>
          )}
          <dl>
            <Row label="Asset public ID" value={record.asset.publicId} />
            <Row label="Resource type" value={record.asset.resourceType} />
            <Row label="Format" value={record.asset.format ?? "not recorded"} />
            <Row
              label="Asset version"
              value={
                record.asset.version === undefined
                  ? "not recorded"
                  : String(record.asset.version)
              }
            />
            <Row label="Delivered by" value="Cloudinary CDN" />
          </dl>
        </div>
      </section>

      <section className="mt-8" aria-label="Evidence and signals">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Evidence &amp; signals
        </h2>
        <dl className="mt-3 rounded-md border border-slate-200 bg-white p-4">
          {SIGNAL_DISPLAY.map(({ slot, component }) => {
            const value = record.signals[slot];
            return (
              <Row
                key={slot}
                label={`${COMPONENT_LABELS[component]} · weight ${ENGINE_WEIGHTS[component]}%`}
                value={value === null ? "not available" : `${value}/100`}
              />
            );
          })}
          <Row
            label="Coverage"
            value={`${record.coverage}/100 of weight scoreable`}
          />
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Signals that were not available are reported as such and excluded from
          the calculation. Missing data is never counted as an inconsistency and
          never imputed as a favourable value.
        </p>
      </section>

      <section className="mt-8" aria-label="Recorded reasons">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Recorded reasons
        </h2>
        <ul className="mt-3 space-y-2 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
          {record.reasons.map((reason, index) => (
            <li key={`${index}-${reason}`}>{reason}</li>
          ))}
        </ul>
      </section>

      {record.flags.length > 0 && (
        <section className="mt-8" aria-label="Flags">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Flags
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {record.flags.map((flag) => (
              <li
                key={flag}
                className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${
                  flag.startsWith("concern:")
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-slate-200 bg-slate-100 text-slate-700"
                }`}
              >
                {flag}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8" aria-label="Record identity">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Record identity and integrity
        </h2>
        <dl className="mt-3 rounded-md border border-slate-200 bg-white p-4">
          <Row label="Record ID" value={record.recordId} />
          <Row label="Recorded at" value={formatTimestamp(record.timestamp)} />
          <Row label="Engine version" value={record.engineVersion} />
          <Row label="Record schema" value={record.schemaVersion} />
          <Row label="Analysis ID" value={record.analysisId ?? "not recorded"} />
          <Row
            label="Integrity check"
            value={
              integrityVerified
                ? "hash reproduced from the stored record"
                : "hash NOT reproduced — record altered"
            }
          />
          <Row label="Record hash (SHA-256)" value={record.recordHash} />
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          The hash makes later edits to this record detectable. It does not make
          the original image immutable, and it does not prove historical
          authenticity.
        </p>
      </section>

      {record.context && (
        <section className="mt-8" aria-label="Submitted claim">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Submitted claim
          </h2>
          <p className="mt-3 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
            {record.context}
          </p>
        </section>
      )}

      <footer className="mt-10 flex flex-wrap items-center gap-4 border-t border-slate-200 pt-6 text-xs text-slate-500">
        <span>Provera · verification record {record.recordId}</span>
        <Link href="/" className="font-medium text-slate-700 underline hover:text-slate-900">
          Start a new verification
        </Link>
        <a
          className="font-medium text-slate-700 underline hover:text-slate-900"
          href={`/api/verify/${record.recordId}`}
        >
          Raw record JSON
        </a>
      </footer>
    </main>
  );
}
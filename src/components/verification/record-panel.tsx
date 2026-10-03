"use client";

import { useState } from "react";
import ArtifactPanel from "@/components/verification/artifact-panel";
import type { VerificationRecord } from "@/lib/verification/record";
import type { ApiResponse } from "@/types";

type RecordPhase = "idle" | "running" | "done" | "error";

type VerifyPayload = {
  record: VerificationRecord;
  integrityVerified: boolean;
  metadataAttached: true;
};

const STATUS_CLASSES: Record<VerificationRecord["status"], string> = {
  VERIFIED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  REVIEW: "border-amber-200 bg-amber-50 text-amber-800",
  FLAGGED: "border-red-200 bg-red-50 text-red-800",
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 break-all text-sm text-slate-800">{value}</dd>
    </div>
  );
}

/**
 * Phase4 record UI: asks the server to create and persist a verification
 * record for the analysed asset, then displays the persisted record.
 *
 * The server re-runs the analysis before building the record, so the numbers
 * shown here come from the record the server stored (and attached to the
 * Cloudinary asset) rather than from anything this component supplied.
 */
export default function RecordPanel({
  publicId,
  context,
}: {
  publicId: string;
  context: string | null;
}) {
  const [phase, setPhase] = useState<RecordPhase>("idle");
  const [record, setRecord] = useState<VerificationRecord | null>(null);
  const [integrityVerified, setIntegrityVerified] = useState(false);
  const [message, setMessage] = useState("");

  async function createRecord() {
    setPhase("running");
    setMessage("");
    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId, context }),
      });
      const body = (await response.json().catch(() => null)) as
        | ApiResponse<VerifyPayload>
        | null;
      if (body && body.ok) {
        setRecord(body.data.record);
        setIntegrityVerified(body.data.integrityVerified);
        setPhase("done");
        return;
      }
      setMessage(
        body && !body.ok
          ? body.error.message
          : `Record creation failed (HTTP ${response.status}).`,
      );
      setPhase("error");
    } catch {
      setMessage("A network error occurred. No verification record was created.");
      setPhase("error");
    }
  }

  return (
    <section
      aria-labelledby="record-heading"
      className="rounded-md border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id="record-heading" className="text-sm font-semibold text-slate-900">
            Verification record
          </h4>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
            Creates a tamper-evident record of this verification state, stores it,
            and attaches the summary to the Cloudinary asset as structured
            metadata. The server re-analyses the asset for the record, so the
            values below come from the stored record itself.
          </p>
        </div>
        {phase !== "done" && (
          <button
            type="button"
            onClick={createRecord}
            disabled={phase === "running"}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {phase === "running"
              ? "Creating record…"
              : "Create verification record"}
          </button>
        )}
      </div>

      {phase === "error" && message && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {message}
        </p>
      )}

      {phase === "done" && record && (
        <div className="mt-5 border-t border-slate-200 pt-5">
          {/* Identity first: the record ID is what every later stage references. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Verification record
              </p>
              <p className="mt-1 font-mono text-lg font-medium tracking-tight text-slate-900">
                {record.recordId}
              </p>
            </div>
            <span
              className={`rounded border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASSES[record.status]}`}
            >
              {record.status}
            </span>
          </div>

          {/* Score is one attribute of the record, shown alongside the other
              figures rather than as the headline number. */}
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-slate-200 pt-4 sm:grid-cols-4">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Score
              </dt>
              <dd className="mt-0.5 text-sm text-slate-900">
                <span className="font-mono text-base font-medium">{record.score}</span>
                <span className="text-slate-500">/100</span>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Coverage
              </dt>
              <dd className="mt-0.5 text-sm text-slate-900">{record.coverage}%</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Recorded
              </dt>
              <dd className="mt-0.5 text-sm text-slate-900">{record.timestamp}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Asset
              </dt>
              <dd className="hash mt-0.5 text-sm text-slate-900">{record.asset.publicId}</dd>
            </div>
          </dl>

          <section className="mt-5" aria-label="Evidence signals">
            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Evidence &amp; signals
            </h5>
            <ul className="mt-2 divide-y divide-slate-100 border-y border-slate-200">
              {(
                [
                  ["Metadata availability", record.signals.metadataAvailability],
                  ["OCR / claim consistency", record.signals.ocrConsistency],
                  ["Visual consistency", record.signals.visualConsistency],
                  ["Duplicate indicator", record.signals.duplicateIndicator],
                  ["Media quality", record.signals.mediaQuality],
                ] as const
              ).map(([label, value]) => (
                <li key={label} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="text-sm text-slate-600">{label}</span>
                  {value === null ? (
                    <span className="text-xs text-amber-700">unavailable — excluded</span>
                  ) : (
                    <span className="font-mono text-sm text-slate-900">{value}/100</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-5" aria-label="Recorded reasons">
            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Reasons ({record.reasons.length})
            </h5>
            <ul className="mt-2 space-y-1">
              {record.reasons.map((reason, index) => (
                <li key={`${index}-${reason}`} className="text-sm leading-relaxed text-slate-600">
                  {reason}
                </li>
              ))}
            </ul>
          </section>

          {record.flags.length > 0 && (
            <section className="mt-5" aria-label="Flags">
              <h5 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Flags
              </h5>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {record.flags.map((flag) => (
                  <li
                    key={flag}
                    className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${
                      flag.startsWith("concern:")
                        ? "border-red-200 bg-red-50 text-red-800"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    {flag}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-5" aria-label="Record integrity">
            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Record integrity
            </h5>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              <Field label="Engine version" value={record.engineVersion} />
              <Field label="Record schema" value={record.schemaVersion} />
            </dl>
            <p className="hash mt-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-slate-700">
              {record.recordHash}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Integrity check:{" "}
              <span
                className={
                  integrityVerified ? "font-medium text-emerald-700" : "font-medium text-red-700"
                }
              >
                {integrityVerified
                  ? "reproduced from the stored record"
                  : "could not be reproduced"}
              </span>
              . The hash detects later edits to this record. It does not make the
              original image immutable and does not prove authenticity.
            </p>
          </section>

          <nav
            aria-label="Record destinations"
            className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 pt-4 text-sm"
          >
            <a
              className="font-medium text-blue-700 underline underline-offset-4 hover:text-blue-900"
              href={`/verify/${record.recordId}`}
              target="_blank"
              rel="noreferrer"
            >
              Open verification page
            </a>
            <a
              className="font-medium text-blue-700 underline underline-offset-4 hover:text-blue-900"
              href={`/inspector?recordId=${record.recordId}`}
            >
              Inspect in Cloudinary
            </a>
            <a
              className="text-slate-500 underline underline-offset-4 hover:text-slate-700"
              href={`/api/verify/${record.recordId}`}
              target="_blank"
              rel="noreferrer"
            >
              Record JSON
            </a>
          </nav>

          <ArtifactPanel recordId={record.recordId} />
        </div>
      )}
    </section>
  );
}

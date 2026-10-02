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
      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 id="record-heading" className="text-sm font-semibold text-slate-800">
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
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-3xl font-bold tracking-tight text-slate-900">
              {record.score}
              <span className="text-base font-medium text-slate-500">/100</span>
            </p>
            <span
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${STATUS_CLASSES[record.status]}`}
            >
              {record.status}
            </span>
            <span className="font-mono text-sm text-slate-700">
              {record.recordId}
            </span>
          </div>

          <dl className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-2">
            <Field
              label="Asset"
              value={`${record.asset.resourceType} · ${record.asset.publicId}`}
            />
            <Field label="Timestamp" value={record.timestamp} />
            <Field label="Engine version" value={record.engineVersion} />
            <Field label="Record schema" value={record.schemaVersion} />
            <Field
              label="Coverage"
              value={`${record.coverage}/100 scoreable weight`}
            />
            <Field
              label="Signals"
              value={[
                `metadata ${record.signals.metadataAvailability ?? "excluded"}`,
                `ocr ${record.signals.ocrConsistency ?? "excluded"}`,
                `visual ${record.signals.visualConsistency ?? "excluded"}`,
                `duplicate ${record.signals.duplicateIndicator ?? "excluded"}`,
                `quality ${record.signals.mediaQuality ?? "excluded"}`,
              ].join(" · ")}
            />
          </dl>

          <div className="rounded-md border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Record hash (SHA-256 of the canonical record)
            </p>
            <p className="mt-1 break-all font-mono text-xs text-slate-700">
              {record.recordHash}
            </p>
            <p className="mt-2 text-xs text-slate-600">
              Integrity check:{" "}
              <span
                className={
                  integrityVerified
                    ? "font-medium text-emerald-700"
                    : "font-medium text-red-700"
                }
              >
                {integrityVerified
                  ? "reproduced from the stored record"
                  : "could not be reproduced"}
              </span>
            </p>
            <p className="mt-2 text-xs text-slate-500">
              The hash detects later edits to this record. It does not make the
              original image immutable and does not prove authenticity.
            </p>
          </div>

          {record.flags.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Flags
              </h5>
              <ul className="mt-2 flex flex-wrap gap-2">
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
            </div>
          )}

          <details className="rounded-md border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
              Recorded reasons ({record.reasons.length})
            </summary>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {record.reasons.map((reason, index) => (
                <li key={`${index}-${reason}`}>{reason}</li>
              ))}
            </ul>
          </details>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>Metadata field prefix: provera_*</span>
            <a
              className="font-medium text-slate-700 underline hover:text-slate-900"
              href={`/verify/${record.recordId}`}
              target="_blank"
              rel="noreferrer"
            >
              Open public verification page
            </a>
            <a
              className="font-medium text-slate-700 underline hover:text-slate-900"
              href={`/api/verify/${record.recordId}`}
              target="_blank"
              rel="noreferrer"
            >
              Retrieve stored record (JSON)
            </a>
          </div>

          <ArtifactPanel recordId={record.recordId} />
        </div>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import type {
  ComponentResult,
  ForensicResult,
  ForensicStatus,
  ReasonKind,
} from "@/lib/forensic/engine";
import type { ApiResponse, NormalizedAnalysis } from "@/types";
import RecordPanel from "@/components/verification/record-panel";

type ScorePhase = "idle" | "running" | "done" | "error";

const STATUS_STYLES: Record<
  ForensicStatus,
  { label: string; className: string }
> = {
  VERIFIED: {
    label: "VERIFIED",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  REVIEW: {
    label: "REVIEW",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  FLAGGED: {
    label: "FLAGGED",
    className: "border-red-200 bg-red-50 text-red-800",
  },
};

const KIND_LABELS: Record<ReasonKind, string> = {
  positive: "Positive",
  concern: "Concern",
  info: "Note",
};

const KIND_CLASSES: Record<ReasonKind, string> = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-800",
  concern: "border-red-200 bg-red-50 text-red-800",
  info: "border-slate-200 bg-slate-50 text-slate-700",
};

function ComponentRow({ component }: { component: ComponentResult }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800">
          {component.label}
        </span>
        <span className="text-xs text-slate-500">weight {component.weight}%</span>
      </div>
      {component.status === "scored" ? (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span className="text-slate-800">
            <span className="font-semibold">{component.score}</span>/100
          </span>
          <span className="text-slate-600">
            contributes <span className="font-medium">{component.contribution}</span>{" "}
            points
          </span>
        </div>
      ) : (
        <p className="mt-1 text-sm text-amber-800">Excluded (unavailable)</p>
      )}
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {component.summary}
      </p>
    </div>
  );
}

export default function ScorePanel({ analysis }: { analysis: NormalizedAnalysis }) {
  const [phase, setPhase] = useState<ScorePhase>("idle");
  const [result, setResult] = useState<ForensicResult | null>(null);
  const [message, setMessage] = useState("");

  async function runScoring() {
    setPhase("running");
    setMessage("");
    try {
      const response = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis }),
      });
      const body = (await response.json().catch(() => null)) as
        | ApiResponse<{ result: ForensicResult }>
        | null;
      if (body && body.ok) {
        setResult(body.data.result);
        setPhase("done");
        return;
      }
      setMessage(
        body && !body.ok
          ? body.error.message
          : `Scoring failed (HTTP ${response.status}).`,
      );
      setPhase("error");
    } catch {
      setMessage("A network error occurred. The score could not be calculated.");
      setPhase("error");
    }
  }

  const statusStyle = result ? STATUS_STYLES[result.status] : null;

  return (
    <section
      aria-label="Forensic consistency score"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">
            Forensic consistency score
          </h4>
          <p className="mt-0.5 text-xs text-slate-500">
            Deterministic weighted scoring across the five signal categories.
          </p>
        </div>
        {phase !== "done" && (
          <button
            type="button"
            onClick={runScoring}
            disabled={phase === "running"}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {phase === "running" ? "Scoring…" : "Calculate score"}
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

      {phase === "done" && result && statusStyle && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-4xl font-bold tracking-tight text-slate-900">
              {result.score}
              <span className="text-base font-medium text-slate-500">/100</span>
            </p>
            <span
              role="status"
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${statusStyle.className}`}
            >
              {statusStyle.label}
            </span>
            <span className="text-xs text-slate-500">
              coverage {result.coverage}/100 · engine {result.engineVersion}
            </span>
          </div>

          <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            <p>
              <span className="font-semibold text-slate-700">What VERIFIED means:</span>{" "}
              the available signals meet Provera&apos;s configured consistency
              threshold. It does not mean that authenticity has been proven.
            </p>
            <p>
              The score is a product-defined consistency heuristic with
              explicitly documented weights. It is not a scientifically
              validated measurement and not a probability of fraud.
            </p>
          </div>

          <div className="grid gap-2">
            {result.components.map((component) => (
              <ComponentRow key={component.signal} component={component} />
            ))}
          </div>

          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Reasons
            </h5>
            <ul className="mt-2 space-y-1.5">
              {result.reasons.map((reason, index) => (
                <li
                  key={`${reason.signal}-${index}`}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <span
                    className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${KIND_CLASSES[reason.kind]}`}
                  >
                    {KIND_LABELS[reason.kind]}
                  </span>
                  <span>{reason.message}</span>
                </li>
              ))}
            </ul>
          </div>

          {result.unavailableSignals.length > 0 && (
            <p className="text-xs text-slate-500">
              {result.unavailableSignals.length} signal(s) unavailable and
              excluded from scoring — see the reasons above. Missing signals are
              never counted as inconsistencies.
            </p>
          )}

          <RecordPanel publicId={analysis.publicId} context={analysis.context} />

          <button
            type="button"
            onClick={runScoring}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Recalculate
          </button>
        </div>
      )}
    </section>
  );
}

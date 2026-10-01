"use client";

import { useState } from "react";
import ScorePanel from "@/components/analysis/score-panel";
import type {
  AnalysisContentTag,
  AnalysisMediaQualityValue,
  AnalysisMetadataValue,
  AnalysisOcrValue,
  AnalysisSignalKey,
  AnalysisSignalStatus,
  AnalysisVisualValue,
  ApiResponse,
  NormalizedAnalysis,
} from "@/types";

type PanelPhase = "idle" | "running" | "success" | "error";

const SIGNAL_ORDER: Array<{ key: AnalysisSignalKey; title: string }> = [
  { key: "metadata", title: "Metadata availability" },
  { key: "ocr", title: "OCR / text" },
  { key: "visual", title: "Visual / content" },
  { key: "fingerprint", title: "Duplicate / fingerprint" },
  { key: "mediaQuality", title: "Media quality" },
];

const STATUS_STYLES: Record<
  AnalysisSignalStatus,
  { label: string; className: string }
> = {
  obtained: {
    label: "Obtained",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  unavailable: {
    label: "Unavailable",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  error: {
    label: "Error",
    className: "border-red-200 bg-red-50 text-red-800",
  },
};

function TagList({ tags }: { tags: AnalysisContentTag[] }) {
  if (tags.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Content tagging returned no labels for this asset.
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li
          key={tag.label}
          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
        >
          {tag.label} · {Math.round(tag.score * 100)}%
        </li>
      ))}
    </ul>
  );
}

function SignalValue({
  analysis,
  signalKey,
}: {
  analysis: NormalizedAnalysis;
  signalKey: AnalysisSignalKey;
}) {
  const signal = analysis.signals[signalKey];
  if (signal.status !== "obtained" || !signal.value) {
    return (
      <p className="text-sm leading-relaxed text-slate-600">
        {signal.reason ?? "No data was returned for this signal."}
      </p>
    );
  }

  if (signalKey === "metadata") {
    const value = signal.value as AnalysisMetadataValue;
    return (
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Image metadata fields</dt>
          <dd className="font-medium text-slate-800">
            {value.imageMetadataKeys.length}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">EXIF fields</dt>
          <dd className="font-medium text-slate-800">
            {value.hasExif ? value.exifFieldCount : "none detected"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Asset created (UTC)</dt>
          <dd className="break-all text-slate-800">{value.createdAt ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Original filename</dt>
          <dd className="break-all text-slate-800">
            {value.originalFilename ?? "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3 sm:col-span-2">
          <dt className="text-slate-500">ETag</dt>
          <dd className="break-all font-mono text-slate-800">
            {value.etag ?? "—"}
          </dd>
        </div>
      </dl>
    );
  }

  if (signalKey === "ocr") {
    const value = signal.value as AnalysisOcrValue;
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-500">
          Engine: {value.engine} · Status: {value.status}
          {value.locale ? ` · Locale: ${value.locale}` : ""}
        </p>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-800">
          {value.text ||
            "Cloudinary OCR completed and detected no text in this image."}
        </pre>
      </div>
    );
  }

  if (signalKey === "visual") {
    const value = signal.value as AnalysisVisualValue;
    return (
      <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Faces</dt>
            <dd className="font-medium text-slate-800">{value.faceCount}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Illustration score</dt>
            <dd className="font-medium text-slate-800">
              {value.illustrationScore !== null
                ? value.illustrationScore.toFixed(3)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Grayscale</dt>
            <dd className="font-medium text-slate-800">
              {value.grayscale === null ? "—" : value.grayscale ? "yes" : "no"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Semi-transparent</dt>
            <dd className="font-medium text-slate-800">
              {value.semiTransparent === null
                ? "—"
                : value.semiTransparent
                  ? "yes"
                  : "no"}
            </dd>
          </div>
        </dl>
        {value.predominantColors.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Predominant colors (Cloudinary)
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {value.predominantColors.map((color) => (
                <li
                  key={color.name}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                >
                  {color.name} · {color.percent}%
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            AI content tags
          </p>
          {value.contentTags !== null ? (
            <TagList tags={value.contentTags} />
          ) : (
            <p className="text-sm leading-relaxed text-slate-600">
              {value.contentTagsReason ?? "Content tagging unavailable."}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (signalKey === "fingerprint") {
    const value = signal.value as { phash: string };
    return (
      <div>
        <p className="text-xs text-slate-500">
          Cloudinary perceptual hash of this asset
        </p>
        <code className="mt-1 block break-all rounded-md bg-slate-50 p-2 text-sm text-slate-800">
          {value.phash}
        </code>
      </div>
    );
  }

  const quality = signal.value as AnalysisMediaQualityValue;
  return (
    <div>
      <p className="text-2xl font-semibold text-slate-900">
        {quality.focus.toFixed(3)}
      </p>
      <p className="mt-1 text-sm text-slate-600">
        Cloudinary quality-analysis focus score (0–1). Higher values indicate a
        sharper, more focused image.
      </p>
    </div>
  );
}

export default function AnalysisPanel({ publicId }: { publicId: string }) {
  const [context, setContext] = useState("");
  const [phase, setPhase] = useState<PanelPhase>("idle");
  const [analysis, setAnalysis] = useState<NormalizedAnalysis | null>(null);
  const [message, setMessage] = useState("");

  async function runAnalysis() {
    setPhase("running");
    setMessage("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId, context }),
      });
      const body = (await response.json().catch(() => null)) as
        | ApiResponse<{ analysis: NormalizedAnalysis }>
        | null;
      if (body && body.ok) {
        setAnalysis(body.data.analysis);
        setPhase("success");
        return;
      }
      setMessage(
        body && !body.ok
          ? body.error.message
          : `Analysis failed (HTTP ${response.status}).`,
      );
      setPhase("error");
    } catch {
      setMessage(
        "A network error occurred. The analysis could not be completed.",
      );
      setPhase("error");
    }
  }

  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-slate-700">Cloudinary analysis</p>
          <p className="mt-1 text-sm text-slate-600">
            Run the configured Cloudinary analysis workflow on this asset and
            inspect the raw signals it returns.
          </p>
        </div>
        {phase === "success" && analysis && (
          <span
            role="status"
            className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"
          >
            {analysis.obtainedSignals.length} of 5 signals obtained
          </span>
        )}
      </div>

      {phase !== "success" && (
        <div className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="analysis-context"
              className="block text-sm font-medium text-slate-700"
            >
              Optional claim / context
            </label>
            <textarea
              id="analysis-context"
              value={context}
              onChange={(event) => setContext(event.target.value)}
              maxLength={2000}
              rows={2}
              placeholder='e.g. "Accident on Main Road, captured this morning"'
              className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              Stored with the analysis result for later consistency checks.
            </p>
          </div>
          <button
            type="button"
            onClick={runAnalysis}
            disabled={phase === "running"}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {phase === "running" ? "Analyzing…" : "Run analysis"}
          </button>
        </div>
      )}

      {phase === "error" && message && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {message}
        </p>
      )}

      {phase === "success" && analysis && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-slate-500">
            Workflow {analysis.workflow} · Analysis {analysis.analysisId} ·{" "}
            {analysis.analyzedAt}
          </p>
          {analysis.context && (
            <p className="text-sm text-slate-600">
              Submitted context:{" "}
              <span className="text-slate-800">
                &ldquo;{analysis.context}&rdquo;
              </span>
            </p>
          )}

          <div className="grid gap-3">
            {SIGNAL_ORDER.map(({ key, title }) => {
              const signal = analysis.signals[key];
              const style = STATUS_STYLES[signal.status];
              return (
                <article
                  key={key}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-slate-800">
                      {title}
                    </h4>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${style.className}`}
                    >
                      {style.label}
                    </span>
                  </div>
                  <div className="mt-2">
                    <SignalValue analysis={analysis} signalKey={key} />
                  </div>
                </article>
              );
            })}
          </div>

          <ScorePanel analysis={analysis} />

          {analysis.limitations.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">
                Capability limitations observed in this run
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-900">
                {analysis.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs leading-relaxed text-slate-500">
            The signal cards show raw values returned by Cloudinary&apos;s
            analysis APIs for this asset. The consistency score is calculated
            separately by the deterministic forensic engine from those signals.
            Unavailable capabilities are reported as unavailable — never
            estimated.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runAnalysis}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Run analysis again
            </button>
            <button
              type="button"
              onClick={() => {
                setAnalysis(null);
                setMessage("");
                setPhase("idle");
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Clear results
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


"use client";

import Image from "next/image";
import { useState } from "react";
import type {
  ArtifactDelivery,
  VerificationArtifact,
} from "@/lib/cloudinary/artifact";
import type { ApiResponse } from "@/types";

type ArtifactPhase = "idle" | "running" | "done" | "error";

type ArtifactPayload = {
  artifact: VerificationArtifact;
  delivery: ArtifactDelivery;
  signatureNote: string;
};

function formatBytes(value: number | null): string {
  if (value === null) return "unknown";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} kB`;
}

/**
 * Phase 5 artifact UI: asks the server to build the signed Cloudinary artifact
 * for a stored record, then displays the artifact Cloudinary actually delivered
 * together with the exact transformation components behind it.
 *
 * The panel reports only what the API verified. If delivery fails, it shows the
 * error instead of an artifact — a failed artifact is never presented as a
 * successful one.
 */
export default function ArtifactPanel({ recordId }: { recordId: string }) {
  const [phase, setPhase] = useState<ArtifactPhase>("idle");
  const [payload, setPayload] = useState<ArtifactPayload | null>(null);
  const [message, setMessage] = useState("");

  async function generateArtifact() {
    setPhase("running");
    setMessage("");
    try {
      const response = await fetch(`/api/artifact/${recordId}`);
      const body = (await response.json().catch(() => null)) as
        | ApiResponse<ArtifactPayload>
        | null;
      if (body && body.ok) {
        setPayload(body.data);
        setPhase("done");
        return;
      }
      setMessage(
        body && !body.ok
          ? body.error.message
          : `Artifact generation failed (HTTP ${response.status}).`,
      );
      setPhase("error");
    } catch {
      setMessage("A network error occurred. No artifact was generated.");
      setPhase("error");
    }
  }

  const artifact = payload?.artifact;
  const delivery = payload?.delivery;

  return (
    <section
      aria-labelledby="artifact-heading"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 id="artifact-heading" className="text-sm font-semibold text-slate-800">
            Signed verification artifact
          </h4>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
            Renders this record as a Cloudinary dynamic transformation of the
            verified asset and delivers it over a signed URL with automatic format
            and quality optimization.
          </p>
        </div>
        {phase !== "done" && (
          <button
            type="button"
            onClick={generateArtifact}
            disabled={phase === "running"}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {phase === "running" ? "Generating…" : "Generate signed artifact"}
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

      {phase === "done" && artifact && delivery && (
        <div className="mt-4 space-y-4">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
            <Image
              src={artifact.url}
              alt={`Provera verification artifact for record ${artifact.recordId}`}
              width={artifact.canvas.width}
              height={artifact.canvas.height}
              className="h-auto w-full"
            />
          </div>

          <dl className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Artifact version
              </dt>
              <dd className="mt-0.5 text-sm text-slate-800">
                {artifact.artifactVersion}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Delivery signature
              </dt>
              <dd className="mt-0.5 break-all font-mono text-sm text-slate-800">
                s--{artifact.signature ?? "absent"}--
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Delivered
              </dt>
              <dd className="mt-0.5 text-sm text-slate-800">
                HTTP {delivery.status} · {delivery.contentType ?? "unknown"} ·{" "}
                {formatBytes(delivery.contentLength)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Optimized delivery
              </dt>
              <dd className="mt-0.5 text-sm text-slate-800">
                f_{artifact.optimization.fetchFormat} · q_{artifact.optimization.quality}
                {delivery.negotiated.length > 0 &&
                  ` · WebP ${formatBytes(delivery.negotiated[0].contentLength)}`}
              </dd>
            </div>
          </dl>

          <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
              Transformation components ({artifact.layers.length})
            </summary>
            <ol className="mt-2 space-y-2">
              {artifact.layers.map((layer, index) => (
                <li key={`${index}-${layer.parameters}`}>
                  <p className="text-xs text-slate-600">{layer.purpose}</p>
                  <p className="mt-0.5 break-all font-mono text-[11px] text-slate-800">
                    {decodeURIComponent(decodeURIComponent(layer.parameters))}
                  </p>
                </li>
              ))}
            </ol>
            <div className="mt-3 border-t border-slate-200 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Signed delivery URL
              </p>
              <p className="mt-1 break-all font-mono text-[11px] text-slate-700">
                {artifact.url}
              </p>
              <a
                className="mt-2 inline-block text-xs font-medium text-slate-700 underline hover:text-slate-900"
                href={artifact.url}
                target="_blank"
                rel="noreferrer"
              >
                Open artifact on the Cloudinary CDN
              </a>
            </div>
          </details>

          <p className="text-xs leading-relaxed text-slate-500">
            {payload?.signatureNote} A signed artifact shows what Provera recorded
            and assessed for this asset at that moment. It is not proof that the
            photograph is authentic.
          </p>
        </div>
      )}
    </section>
  );
}
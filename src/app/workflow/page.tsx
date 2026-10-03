import UploadForm from "@/components/upload/upload-form";
import { PageShell } from "@/components/site/site-footer";

/**
 * Verification workspace.
 *
 * This is where the work happens: `UploadForm` drives the existing chain —
 * upload → analysis → scoring → verification record → signed artifact with QR —
 * and each stage reveals the next one. No business logic is duplicated here;
 * the page only supplies the surrounding frame and the pipeline context that
 * tells a reader where in the evidence chain they currently are.
 */

const STAGES = [
  { label: "Media asset", owner: "browser" },
  { label: "Cloudinary ingestion", owner: "Cloudinary" },
  { label: "Evidence & signals", owner: "Cloudinary" },
  { label: "Consistency checks", owner: "Provera" },
  { label: "Verification record", owner: "Provera" },
  { label: "Structured metadata", owner: "Cloudinary" },
  { label: "Artifact & QR", owner: "Cloudinary" },
  { label: "Inspector / Audit", owner: "Provera" },
] as const;

export default function WorkflowPage() {
  return (
    <PageShell active="/workflow">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Verification workspace
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Upload an asset and work through the chain below. Each step is explicit:
          uploading does not analyse, analysing does not score, and a score alone
          is not a verification record.
        </p>

        <section className="mt-8" aria-labelledby="chain-heading">
          <h2
            id="chain-heading"
            className="text-sm font-semibold uppercase tracking-wide text-slate-500"
          >
            Evidence chain
          </h2>
          <ol className="mt-3 flex flex-wrap gap-x-2 gap-y-2">
            {STAGES.map((stage, index) => (
              <li key={stage.label} className="flex items-center gap-2">
                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                  {stage.label}
                </span>
                <span className="text-[11px] text-slate-400">{stage.owner}</span>
                {index < STAGES.length - 1 ? (
                  <span aria-hidden="true" className="text-slate-300">
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10" aria-labelledby="upload-heading">
          <h2
            id="upload-heading"
            className="text-sm font-semibold uppercase tracking-wide text-slate-500"
          >
            Start
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Images are validated by declared type and by their actual bytes, then
            stored directly in the configured Cloudinary account.
          </p>
          <div className="mt-4">
            <UploadForm />
          </div>
        </section>
      </div>
    </PageShell>
  );
}
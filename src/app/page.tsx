const PLACEHOLDER_NAV = [
  { label: "Workflow", href: "/", active: true },
  { label: "Inspector", href: "#workflow-placeholder", active: false },
  { label: "Verification", href: "#workflow-placeholder", active: false },
] as const;

const WORKFLOW_STEPS = [
  {
    title: "Upload & analysis",
    description:
      "Upload field media through Cloudinary and obtain supported analysis, OCR and visual signals.",
    state: "Coming soon",
  },
  {
    title: "Forensic consistency score",
    description:
      "A deterministic, explainable score across five weighted signals with visible reasons.",
    state: "Coming soon",
  },
  {
    title: "Verification record & QR",
    description:
      "A signed verification artifact with an integrity hash and a QR code linking to the verification page.",
    state: "Coming soon",
  },
] as const;

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white"
            >
              P
            </span>
            <span className="text-lg font-semibold tracking-tight text-slate-900">
              Provera
            </span>
          </div>
          <nav aria-label="Main navigation">
            <ul className="flex items-center gap-1 text-sm">
              {PLACEHOLDER_NAV.map((item) => (
                <li key={item.label}>
                  {item.active ? (
                    <a
                      href={item.href}
                      aria-current="page"
                      className="rounded-md px-3 py-2 font-medium text-slate-900 underline-offset-4 hover:underline"
                    >
                      {item.label}
                    </a>
                  ) : (
                    <span
                      aria-disabled="true"
                      title="Coming soon"
                      className="cursor-not-allowed rounded-md px-3 py-2 text-slate-400"
                    >
                      {item.label}
                      <span className="ml-2 hidden rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 sm:inline-block">
                        Soon
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Cloudinary AI Hackathon 2026 · Track 1 — AI Media Pipelines
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Audit-ready media verification artifacts powered by Cloudinary
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-600">
            Provera turns uploaded field media into a transparent verification
            record by combining Cloudinary media ingestion, supported AI and
            media analysis, OCR and visual signals, deterministic consistency
            checks, structured metadata, signed transformations, optimized
            delivery, and QR verification.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-500">
            Provera produces a transparent Forensic Consistency Score and a
            signed verification record tied to a specific asset. It does not
            claim to prove historical authenticity, calculate a scientifically
            validated fraud probability, or make a legally binding fraud
            determination.
          </p>
        </section>

        <section
          id="workflow-placeholder"
          aria-labelledby="workflow-heading"
          className="mx-auto w-full max-w-5xl px-4 pb-12 sm:px-6 sm:pb-16"
        >
          <div className="flex items-center justify-between gap-4">
            <h2
              id="workflow-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Verification workflow
            </h2>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              Placeholder — implementation in progress
            </span>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WORKFLOW_STEPS.map((step, index) => (
              <article
                key={step.title}
                className="flex flex-col rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-400">
                    Step {index + 1}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                    {step.state}
                  </span>
                </div>
                <h3 className="mt-3 font-semibold text-slate-800">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {step.description}
                </p>
                <div
                  aria-hidden="true"
                  className="mt-4 h-9 w-full rounded-md border border-slate-200 bg-white/60"
                />
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Provera · Team Vermithor · Pixels to Products — Cloudinary AI
            Hackathon 2026
          </p>
          <p>
            Consistency signals, not fraud probabilities. See{" "}
            <a
              href="https://github.com/sathiyapriya033/Provera"
              className="underline underline-offset-4 hover:text-slate-700"
            >
              the repository documentation
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}
import Link from "next/link";
import { PageShell } from "@/components/site/site-footer";

/**
 * Product home page.
 *
 * Concise by intent: what Provera is, one primary action, and the pipeline. The
 * verification workspace itself lives at `/workflow`, so this page introduces the
 * product rather than being a second place to do the work.
 */

const PIPELINE = [
  {
    step: "01",
    title: "Ingest",
    body: "The asset is stored in Cloudinary and identified by public ID and asset version.",
  },
  {
    step: "02",
    title: "Analyze",
    body: "Cloudinary analysis runs server-side. Capabilities the account does not offer are reported as unavailable, never guessed.",
  },
  {
    step: "03",
    title: "Evaluate",
    body: "Deterministic rules turn the signals into a consistency score with a written reason for every component.",
  },
  {
    step: "04",
    title: "Record",
    body: "A canonical record is stored and hashed, then mirrored onto the asset as provera_* structured metadata.",
  },
  {
    step: "05",
    title: "Publish",
    body: "A signed transformation renders the record onto the image, with a QR code pointing to the public page.",
  },
  {
    step: "06",
    title: "Inspect",
    body: "Inspector and Audit read the live Cloudinary state back, so the stored record can be checked against the asset and its metadata.",
  },
] as const;

const OUTCOMES = [
  {
    title: "Verification record",
    caption: "Evidence + integrity",
    body: "What was observed, when, and under which engine version — hashed so later edits to the record are detectable.",
  },
  {
    title: "Shareable artifact",
    caption: "QR → public verification / signed transformation",
    body: "The record rendered onto the image as a signed Cloudinary transformation, with a QR code back to the public page.",
  },
  {
    title: "Audit trail",
    caption: "Cloudinary state / Inspector + Audit",
    body: "Structured metadata on the asset, and two views that read the live account back rather than trusting stored numbers.",
  },
] as const;

export default function Home() {
  return (
    <PageShell active="/">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <p className="text-sm font-medium tracking-wide text-blue-700">Provera</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Media verification with an evidence trail.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
          Provera turns an uploaded asset into a verification record: the signals
          Cloudinary can observe, the deterministic checks applied to them, the
          record that results, and the artifact and QR code that let anyone check
          the verification record independently.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href="/workflow"
            className="inline-flex items-center rounded border border-blue-700 bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            Verify an asset
          </Link>
          <Link
            href="/inspector"
            className="text-sm font-medium text-blue-700 underline underline-offset-4 hover:text-blue-900"
          >
            Inspector
          </Link>
          <Link
            href="/audit"
            className="text-sm font-medium text-blue-700 underline underline-offset-4 hover:text-blue-900"
          >
            Audit
          </Link>
        </div>

        <section
          className="mt-14 border-t border-slate-200 pt-8"
          aria-labelledby="outcomes-heading"
        >
          <h2
            id="outcomes-heading"
            className="text-sm font-semibold uppercase tracking-wide text-slate-500"
          >
            What you get
          </h2>
          {/* Hairline-separated columns rather than cards: the same visual
              language as the pipeline below, so it reads as product surface. */}
          <dl className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-3">
            {OUTCOMES.map((item) => (
              <div key={item.title} className="border-t border-slate-200 pt-3">
                <dt className="text-sm font-semibold text-slate-900">{item.title}</dt>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                  {item.caption}
                </p>
                <dd className="mt-2 text-sm leading-relaxed text-slate-600">
                  {item.body}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          className="mt-14 border-t border-slate-200 pt-8"
          aria-labelledby="how-heading"
        >
          <h2
            id="how-heading"
            className="text-sm font-semibold uppercase tracking-wide text-slate-500"
          >
            How verification works
          </h2>
          <ol className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {PIPELINE.map((item) => (
              <li key={item.step} className="border-t border-slate-200 pt-3">
                <p className="font-mono text-xs text-slate-400">{item.step}</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="mt-12 border-t border-slate-200 pt-6"
          aria-labelledby="scope-heading"
        >
          <h2
            id="scope-heading"
            className="text-sm font-semibold uppercase tracking-wide text-slate-500"
          >
            Scope
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
            Provera does not claim to prove historical authenticity, calculate a
            scientifically validated fraud probability, or make an image immutable.
            It records what was observable about an asset at a moment in time, and
            states plainly what that record cannot show. The integrity hash detects
            later edits to the record; it says nothing about the photograph itself.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
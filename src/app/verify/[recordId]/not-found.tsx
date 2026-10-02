import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Provera — record not found",
  robots: { index: false, follow: false },
};

/**
 * Rendered when a well-formed record ID is not in the store — for example when a
 * record was created on another instance or before a redeploy.
 *
 * Note on HTTP status: this route is dynamic and streamed, so `notFound()` can
 * only swap the rendered body; the response may still arrive with HTTP 200. The
 * state itself is unambiguous and the page is marked `noindex`.
 */
export default function VerificationRecordNotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Record not found
      </h1>
      <p className="mt-3 text-sm text-slate-700">
        This ID is a valid Provera record ID, but no record is stored for it on
        this server.
      </p>
      <ul className="mt-4 space-y-2 text-sm text-slate-600">
        <li>
          · The record may belong to a different deployment of Provera.
        </li>
        <li>
          · Records are stored on the server that created them and are not
          replicated.
        </li>
        <li>· The record may have been created before the last redeploy.</li>
      </ul>
      <p className="mt-4 text-sm text-slate-600">
        Nothing is inferred from a missing record: an unknown record is reported as
        unknown, never as a passed or a failed verification.
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
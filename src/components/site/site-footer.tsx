import Link from "next/link";
import SiteHeader from "./site-header";

/**
 * Shared product footer.
 *
 * Hackathon framing (team name, event, track) is deliberately absent: this is a
 * standalone product surface, and that history belongs in the repository README
 * rather than in the running application. Cloudinary is credited as the media
 * infrastructure because the product's behaviour depends on it.
 */
export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Provera · media verification records with an evidence trail
        </p>
        <p>
          Media ingestion, analysis, structured metadata, transformations and
          delivery run on{" "}
          <span className="font-medium text-slate-700">Cloudinary</span>. Scoring is
          deterministic and explainable — it is not proof of authenticity.
        </p>
      </div>
    </footer>
  );
}

/** Shared page shell so every route gets the same width and header placement. */
export function PageShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader active={active} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

/** Inline link used inside page copy. */
export function QuietLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-medium text-blue-700 underline underline-offset-4 hover:text-blue-900"
    >
      {children}
    </Link>
  );
}
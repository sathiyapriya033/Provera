import Link from "next/link";

/**
 * Provera wordmark.
 *
 * The mark refines the "P" that the project has always used — a dark square with
 * the letter reversed out — kept deliberately plain: no shield, no checkmark, no
 * cloud, no sparkle. At 28px the square must still read cleanly next to 14px nav
 * text, so the letter is centred and optically balanced rather than tightly fit.
 *
 * It is a single component rather than markup repeated per page, so the header
 * and any future surface cannot drift apart.
 */
export default function Logo({
  href = "/",
  className = "",
}: {
  /** Defaults to the home page. */
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 ${className}`}
      aria-label="Provera — home"
    >
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-900 font-mono text-[13px] font-medium leading-none text-white"
      >
        P
      </span>
      <span className="text-sm font-semibold tracking-tight text-slate-900">
        Provera
      </span>
    </Link>
  );
}
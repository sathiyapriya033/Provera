import Link from "next/link";
import Logo from "./logo";

/**
 * Shared product navigation.
 *
 * This was previously inlined in the home page only, which left `/inspector`,
 * `/audit` and `/workflow` with no way back. Keeping it in one component means
 * the route set cannot drift between pages.
 *
 * "Workflow" points at the real workspace (`/workflow`) rather than an anchor on
 * the home page, which previously returned the reader to the top of a page they
 * were already on.
 */

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/workflow", label: "Workflow" },
  { href: "/inspector", label: "Inspector" },
  { href: "/audit", label: "Audit" },
] as const;

export default function SiteHeader({
  active,
  tagline,
}: {
  /** The active route, e.g. "/audit". */
  active: string;
  tagline?: string;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-baseline gap-2">
          <Logo />
          {tagline ? (
            <span className="hidden text-xs text-slate-500 sm:inline">{tagline}</span>
          ) : null}
        </div>

        <nav aria-label="Main">
          {/* Wraps rather than scrolls on narrow screens, so every destination
              stays reachable without a horizontal gesture. */}
          <ul className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
            {LINKS.map((link) => {
              const current = link.href === active;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={current ? "page" : undefined}
                    className={
                      current
                        ? "inline-block rounded px-2.5 py-1 font-medium text-blue-700 underline-offset-4"
                        : "inline-block rounded px-2.5 py-1 text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
                    }
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
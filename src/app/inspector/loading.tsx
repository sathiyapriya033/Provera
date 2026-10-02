export default function LoadingInspector() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
      <p role="status" aria-live="polite" className="text-sm text-slate-600">
        Reading the record and the live Cloudinary state…
      </p>
      <div className="mt-4 space-y-3" aria-hidden="true">
        <div className="h-8 w-72 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-56 animate-pulse rounded bg-slate-100" />
        <div className="h-32 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-48 w-full animate-pulse rounded bg-slate-100" />
      </div>
    </main>
  );
}

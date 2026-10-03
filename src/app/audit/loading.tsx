export default function LoadingAudit() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <p role="status" aria-live="polite" className="text-sm text-slate-600">
        Reading verification metadata from Cloudinary…
      </p>
      <div className="mt-4 space-y-3" aria-hidden="true">
        <div className="h-8 w-72 animate-pulse bg-slate-100" />
        <div className="h-24 w-full animate-pulse bg-slate-50" />
        <div className="h-64 w-full animate-pulse bg-slate-50" />
      </div>
    </main>
  );
}

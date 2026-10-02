export default function LoadingVerificationRecord() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-slate-600"
      >
        Loading verification record…
      </p>
      <div className="mt-4 space-y-3" aria-hidden="true">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-24 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-40 w-full animate-pulse rounded bg-slate-100" />
      </div>
    </main>
  );
}
export default function LoadingWorkflow() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <p role="status" aria-live="polite" className="text-sm text-slate-600">
        Preparing the verification workspace…
      </p>
      <div className="mt-4 space-y-3" aria-hidden="true">
        <div className="h-8 w-64 animate-pulse bg-slate-100" />
        <div className="h-20 w-full animate-pulse bg-slate-50" />
        <div className="h-40 w-full animate-pulse bg-slate-50" />
      </div>
    </main>
  );
}
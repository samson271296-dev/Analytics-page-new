import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col items-center gap-10 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Report Dashboard
        </h1>
        <p className="text-center text-zinc-600 dark:text-zinc-400">
          Upload reports and view ticket metrics. Two report types supported.
        </p>

        <div className="w-full max-w-xl space-y-6">
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Assigned To Resolve Report
            </h2>
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
              Original report: assign/dispose agents, disposition, queues.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/upload"
                className="flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Upload Report
              </Link>
              <Link
                href="/dashboard"
                className="flex h-10 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
              >
                Dashboard
              </Link>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Ticket Detail Report
            </h2>
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
              New report: Ticket No, Created/Resolved dates, Assigned To, Disposed By, Landing Queue, and full Excel columns.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/ticket-detail-report/upload"
                className="flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Upload Ticket Detail
              </Link>
              <Link
                href="/ticket-detail-report/dashboard"
                className="flex h-10 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
              >
                Ticket Detail Dashboard
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

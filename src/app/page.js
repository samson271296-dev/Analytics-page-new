import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col items-center gap-10 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Report Dashboard
        </h1>
        <p className="text-center text-zinc-600 dark:text-zinc-400">
          Upload Assigned To Resolve reports and view ticket metrics.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/upload"
            className="flex h-12 w-full items-center justify-center rounded-full bg-zinc-900 px-6 text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:w-48"
          >
            Upload Report
          </Link>
          <Link
            href="/dashboard"
            className="flex h-12 w-full items-center justify-center rounded-full border border-zinc-300 px-6 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800 sm:w-48"
          >
            Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";

export default function TicketDetailUploadPage() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setStatus("Please select a file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    setStatus("Uploading...");
    try {
      const res = await fetch("/api/ticket-detail-report/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(`Imported ${data.count} rows successfully.`);
        setFile(null);
      } else {
        setStatus(`Error: ${data.message || data.error || "Upload failed"}`);
      }
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <Link
          href="/"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Home
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <h2 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Upload Ticket Detail Report
        </h2>
        <p className="mb-8 text-zinc-600 dark:text-zinc-400">
          Select an Excel file (.xlsx or .xls) with Ticket No, Created Date/Time,
          Resolved Date/Time, Assigned To, Disposed By, Landing Queue, etc.
        </p>
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-zinc-900 dark:text-zinc-400 dark:file:bg-zinc-700 dark:file:text-zinc-100"
          />
          <button
            type="submit"
            disabled={loading}
            className="h-11 rounded-lg bg-zinc-900 font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "Uploading…" : "Upload"}
          </button>
          {status && (
            <p
              className={`text-sm ${
                status.startsWith("Error")
                  ? "text-red-600 dark:text-red-400"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {status}
            </p>
          )}
        </form>
        <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          <Link
            href="/ticket-detail-report/dashboard"
            className="font-medium text-zinc-700 hover:underline dark:text-zinc-300"
          >
            Go to Ticket Detail Dashboard →
          </Link>
        </p>
      </main>
    </div>
  );
}

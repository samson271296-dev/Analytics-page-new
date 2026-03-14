"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { parse, formatHex } from "culori";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { Bar, Doughnut, Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ChartDataLabels
);

/* Avoid "unsupported color function lab" – Tailwind v4 uses lab(); Chart.js only supports hex/rgb/rgba */
ChartJS.defaults.color = "#374151";
ChartJS.defaults.borderColor = "#e5e7eb";
ChartJS.defaults.font.family = "system-ui, sans-serif";

/** Plugin config so counts are always visible (for PDF export and at a glance) */
const dataLabelsPlugin = {
  id: "datalabels",
  formatter: (value) => (value != null ? String(value) : ""),
  color: "#1f2937",
  font: { size: 12, weight: "600" },
  anchor: "end",
  align: "end",
  clamp: true,
};
const dataLabelsDoughnut = {
  ...dataLabelsPlugin,
  anchor: "center",
  align: "center",
  color: "#fff",
};
const dataLabelsLine = {
  ...dataLabelsPlugin,
  anchor: "end",
  align: "top",
};

const metricLabels = {
  totalTickets: "Total tickets",
  outOfSlaCount: "Out of SLA",
  outOfSlaPercent: "Out of SLA %",
  resolvedPercent: "Resolved %",
  pendingPercent: "Pending %",
  overallUnattended: "Overall unattended",
  unattendedPrevDay: "Total unattended from previous day",
  createdToday: "Total tickets created today",
  totalAssigned: "Total assigned",
  totalResolved: "Total resolved",
  overallPending: "Overall pending",
  pendingToday: "Total pending today",
  overallCustomerWaiting: "Overall customer waiting",
  customerWaitingToday: "Total customer waiting from today",
};

const CHART_COLORS = [
  "rgba(59, 130, 246, 0.8)",
  "rgba(34, 197, 94, 0.8)",
  "rgba(245, 158, 11, 0.8)",
  "rgba(239, 68, 68, 0.8)",
  "rgba(168, 85, 247, 0.8)",
  "rgba(20, 184, 166, 0.8)",
  "rgba(249, 115, 22, 0.8)",
  "rgba(236, 72, 153, 0.8)",
];

function buildQueryString(filters) {
  const p = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v != null && String(v).trim() !== "") p.set(k, String(v).trim());
  });
  return p.toString();
}

const emptyFilters = {
  dateFrom: "",
  dateTo: "",
  assignToAgentName: "",
  disposeByAgentName: "",
  dispositionSubStatus: "",
  dispositionStatus: "",
  landingQueue: "",
  lastQueue: "",
  source: "",
  createReason: "",
  ticketId: "",
};

export default function DashboardPage() {
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [filterOptions, setFilterOptions] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [reports, setReports] = useState(null);
  const [charts, setCharts] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showFullDetailsTable, setShowFullDetailsTable] = useState(false);
  const tableScrollRef = useRef(null);
  const pdfExportRef = useRef(null);

  const queryString = buildQueryString(appliedFilters);
  const reportsList = reports?.reports || [];
  const rowVirtualizer = useVirtualizer({
    count: reportsList.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = queryString ? `?${queryString}` : "";
      const [metricsRes, reportsRes, chartsRes] = await Promise.all([
        fetch(`/api/metrics${q}`),
        fetch(`/api/reports${q ? `?${queryString}` : ""}`),
        fetch(`/api/charts${q}`),
      ]);
      if (!metricsRes.ok) throw new Error("Failed to load metrics");
      if (!reportsRes.ok) throw new Error("Failed to load report details");
      if (!chartsRes.ok) throw new Error("Failed to load chart data");
      const [metricsData, reportsData, chartsData] = await Promise.all([
        metricsRes.json(),
        reportsRes.json(),
        chartsRes.json(),
      ]);
      setMetrics(metricsData);
      setReports(reportsData);
      setCharts(chartsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const res = await fetch("/api/filter-options");
        if (res.ok) setFilterOptions(await res.json());
      } catch (_) {}
    };
    loadOptions();
  }, []);

  const applyFilters = () => setAppliedFilters(filters);
  const clearFilters = () => {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
  };

  const exportCsv = () => {
    if (!reports?.reports?.length || columns.length === 0) return;
    const head = columns.join(",");
    const escape = (v) => {
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const rows = reports.reports.map((rec) =>
      columns.map((col) => escape(rec.raw?.[col])).join(",")
    );
    const csv = [head, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** Convert CSS color (e.g. lab() from Tailwind v4) to hex so html2canvas can parse it */
  const cssColorToHex = (value) => {
    if (!value || value === "transparent") return value;
    try {
      const parsed = parse(value);
      return parsed ? formatHex(parsed) : value;
    } catch {
      return value;
    }
  };

  const exportToPdf = async () => {
    if (!pdfExportRef.current) return;
    const saved = new Map();
    const needsConvert = (v) => v && (v.includes("lab(") || v.includes("lch(") || v.includes("oklch("));
    const toHex = (v) => (needsConvert(v) ? cssColorToHex(v) : null);
    const walk = (el, restore) => {
      const s = window.getComputedStyle(el);
      const key = el;
      const props = [
        ["color", s.color],
        ["backgroundColor", s.backgroundColor],
        ["borderColor", s.borderColor],
        ["borderTopColor", s.borderTopColor],
        ["borderRightColor", s.borderRightColor],
        ["borderBottomColor", s.borderBottomColor],
        ["borderLeftColor", s.borderLeftColor],
        ["outlineColor", s.outlineColor],
      ];
      for (const [prop, value] of props) {
        const hex = toHex(value);
        if (hex) {
          if (!restore) {
            const prev = saved.get(key) || {};
            saved.set(key, { ...prev, [prop]: el.style[prop] });
            el.style[prop] = hex;
          } else if (saved.has(key)) {
            const prev = saved.get(key)[prop];
            if (prev !== undefined) el.style[prop] = prev;
          }
        }
      }
      for (const child of el.children) walk(child, restore);
    };
    let savedRoot = null;
    try {
      const root = pdfExportRef.current;
      savedRoot = { overflow: root.style.overflow, height: root.style.height, maxHeight: root.style.maxHeight };
      root.style.overflow = "visible";
      root.style.height = "auto";
      root.style.maxHeight = "none";
      walk(root, false);
      const canvas = await html2canvas(root, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#fafafa",
        logging: false,
      });
      walk(root, true);
      const imgData = canvas.toDataURL("image/png");
      const pageW = 210;
      const imgW = pageW;
      const imgH = (canvas.height * pageW) / canvas.width;
      const pdf = new jsPDF("p", "mm", [pageW, imgH]);
      pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH);
      pdf.save(`dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      if (pdfExportRef.current && savedRoot) {
        const root = pdfExportRef.current;
        root.style.overflow = savedRoot.overflow ?? "";
        root.style.height = savedRoot.height ?? "";
        root.style.maxHeight = savedRoot.maxHeight ?? "";
      }
    }
  };

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <Link href="/" className="mt-4 text-zinc-600 hover:underline dark:text-zinc-400">
          ← Home
        </Link>
      </div>
    );
  }

  if (loading && !metrics) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-600 dark:text-zinc-400">Loading dashboard…</p>
      </div>
    );
  }

  const columns =
    reports?.reports?.length > 0
      ? Object.keys(reports.reports[0].raw || {})
      : [];

  const barData = metrics
    ? {
        labels: [
          "Unattended (prev day)",
          "Created today",
          "Pending today",
          "Customer waiting (today)",
        ],
        datasets: [
          {
            label: "Count",
            data: [
              metrics.unattendedPrevDay,
              metrics.createdToday,
              metrics.pendingToday,
              metrics.customerWaitingToday,
            ],
            backgroundColor: CHART_COLORS.slice(0, 4),
          },
        ],
      }
    : null;

  const doughnutData = metrics
    ? {
        labels: ["Resolved", "Pending"],
        datasets: [
          {
            data: [metrics.totalResolved, metrics.overallPending],
            backgroundColor: ["rgba(34, 197, 94, 0.8)", "rgba(245, 158, 11, 0.8)"],
            borderWidth: 0,
          },
        ],
      }
    : null;

  /* Explicit hex/rgb only – avoid Tailwind lab() parsing errors in Chart.js */
  const chartTextColor = "#374151";
  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false, labels: { color: chartTextColor } },
      title: { display: true, color: chartTextColor },
      tooltip: { titleColor: "#fff", bodyColor: "#fff" },
      datalabels: dataLabelsPlugin,
    },
    scales: {
      y: { beginAtZero: true, ticks: { color: chartTextColor }, title: { color: chartTextColor } },
      x: { ticks: { color: chartTextColor }, title: { color: chartTextColor } },
    },
  };

  const barChartOptions = (title) => ({
    ...chartOptions,
    plugins: { ...chartOptions.plugins, title: { display: true, text: title, color: chartTextColor } },
  });

  const doughnutChartOptions = (title, legendPosition = "bottom") => ({
    responsive: true,
    plugins: {
      legend: { position: legendPosition, labels: { color: chartTextColor } },
      title: { display: true, text: title, color: chartTextColor },
      tooltip: { titleColor: "#fff", bodyColor: "#fff" },
      datalabels: dataLabelsDoughnut,
    },
  });

  const lineChartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false, labels: { color: chartTextColor } },
      title: { display: true, text: "Tickets by day", color: chartTextColor },
      tooltip: { titleColor: "#fff", bodyColor: "#fff" },
      datalabels: dataLabelsLine,
    },
    scales: {
      y: { beginAtZero: true, ticks: { color: chartTextColor }, title: { color: chartTextColor } },
      x: { title: { display: true, text: "Date", color: chartTextColor }, ticks: { color: chartTextColor } },
    },
  };

  const opts = filterOptions || {};

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <Link
          href="/"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Home
        </Link>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Project Dashboard
        </h1>

        {/* Filters */}
        <section className="mb-8 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Filters
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Date from</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Date to</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Assign to agent</label>
              <select
                value={filters.assignToAgentName}
                onChange={(e) => setFilters((f) => ({ ...f, assignToAgentName: e.target.value }))}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">All</option>
                {(opts.assignToAgentNames || []).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Dispose by agent</label>
              <select
                value={filters.disposeByAgentName}
                onChange={(e) => setFilters((f) => ({ ...f, disposeByAgentName: e.target.value }))}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">All</option>
                {(opts.disposeByAgentNames || []).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Disposition sub status</label>
              <select
                value={filters.dispositionSubStatus}
                onChange={(e) => setFilters((f) => ({ ...f, dispositionSubStatus: e.target.value }))}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">All</option>
                {(opts.dispositionSubStatuses || []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Disposition status</label>
              <select
                value={filters.dispositionStatus}
                onChange={(e) => setFilters((f) => ({ ...f, dispositionStatus: e.target.value }))}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">All</option>
                {(opts.dispositionStatuses || []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Landing queue</label>
              <select
                value={filters.landingQueue}
                onChange={(e) => setFilters((f) => ({ ...f, landingQueue: e.target.value }))}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">All</option>
                {(opts.landingQueueNames || []).map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Last queue</label>
              <select
                value={filters.lastQueue}
                onChange={(e) => setFilters((f) => ({ ...f, lastQueue: e.target.value }))}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">All</option>
                {(opts.lastQueueNames || []).map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Source</label>
              <select
                value={filters.source}
                onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">All</option>
                {(opts.sources || []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Create reason</label>
              <select
                value={filters.createReason}
                onChange={(e) => setFilters((f) => ({ ...f, createReason: e.target.value }))}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">All</option>
                {(opts.createReasons || []).map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Ticket ID</label>
              <input
                type="text"
                placeholder="e.g. 4773403025529"
                value={filters.ticketId}
                onChange={(e) => setFilters((f) => ({ ...f, ticketId: e.target.value }))}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={applyFilters}
              disabled={loading}
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {loading ? "Loading…" : "Apply"}
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Clear filters
            </button>
          </div>
        </section>

        {loading && metrics && (
          <p className="mb-4 text-sm text-zinc-500">Updating data…</p>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={exportToPdf}
            disabled={!metrics}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Export to PDF
          </button>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Exports summary and all charts below.
          </span>
        </div>

        {/* PDF export area: summary + all charts (counts always visible) */}
        <div ref={pdfExportRef} className="rounded-lg bg-white p-4 dark:bg-zinc-900">
        {/* Summary strip */}
        {metrics && (
          <div data-pdf-section className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              {metrics.totalTickets ?? 0} tickets
            </span>
            <span className="text-zinc-500 dark:text-zinc-400">•</span>
            <span>
              <span className="text-zinc-600 dark:text-zinc-300">Resolved:</span>{" "}
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {metrics.resolvedPercent ?? 0}%
              </span> ({metrics.totalResolved ?? 0})
            </span>
            <span className="text-zinc-500 dark:text-zinc-400">•</span>
            <span>
              <span className="text-zinc-600 dark:text-zinc-300">Pending:</span>{" "}
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {metrics.pendingPercent ?? 0}%
              </span> ({metrics.overallPending ?? 0})
            </span>
            <span className="text-zinc-500 dark:text-zinc-400">•</span>
            <span>
              <span className="text-zinc-600 dark:text-zinc-300">Out of SLA:</span>{" "}
              <span className="font-medium text-red-600 dark:text-red-400">
                {metrics.outOfSlaCount ?? 0}
              </span> ({metrics.outOfSlaPercent ?? 0}%)
            </span>
          </div>
        )}

        {/* Disposition summary – two bar graphs */}
        {(charts?.byDispositionSubStatus?.length > 0 ||
          charts?.byDispositionStatus?.length > 0) && (
          <div className="mb-8 grid gap-6 sm:grid-cols-2">
            {charts?.byDispositionSubStatus?.length > 0 && (
              <div data-pdf-section className="min-h-[320px] rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Disposition sub status
                  </h3>
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Total: {charts.byDispositionSubStatus.reduce((s, { count }) => s + count, 0).toLocaleString()}
                  </span>
                </div>
                <Bar
                  data={{
                    labels: charts.byDispositionSubStatus.map((x) => x.label || "(empty)"),
                    datasets: [{ label: "Count", data: charts.byDispositionSubStatus.map((x) => x.count), backgroundColor: CHART_COLORS }],
                  }}
                  options={barChartOptions("Count by disposition sub status")}
                />
              </div>
            )}
            {charts?.byDispositionStatus?.length > 0 && (
              <div data-pdf-section className="min-h-[320px] rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Disposition status
                  </h3>
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Total: {charts.byDispositionStatus.reduce((s, { count }) => s + count, 0).toLocaleString()}
                  </span>
                </div>
                <Bar
                  data={{
                    labels: charts.byDispositionStatus.map((x) => x.label || "(empty)"),
                    datasets: [{ label: "Count", data: charts.byDispositionStatus.map((x) => x.count), backgroundColor: CHART_COLORS }],
                  }}
                  options={barChartOptions("Count by disposition status")}
                />
              </div>
            )}
          </div>
        )}

        {/* Metric cards */}
        <div data-pdf-section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics &&
            Object.entries(metricLabels).map(([key, label]) => (
              <div
                key={key}
                className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {metrics[key] ?? 0}
                </p>
              </div>
            ))}
        </div>

        {/* Charts row 1 */}
        <div className="mb-8 grid gap-6 sm:grid-cols-2">
          {barData && (
            <div data-pdf-section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <Bar data={barData} options={barChartOptions("Today & recent metrics")} />
            </div>
          )}
          {doughnutData && (
            <div data-pdf-section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <Doughnut
                data={doughnutData}
                options={doughnutChartOptions("Resolved vs Pending")}
              />
            </div>
          )}
        </div>

        {/* Agent charts – 1×1 full width, scrollable so all names visible */}
        {charts?.byAssignToAgent?.length > 0 && (
          <div data-pdf-section className="mb-8 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              By assign-to agent ({charts.byAssignToAgent.length} agents)
            </h3>
            <div className="rounded border border-zinc-100 dark:border-zinc-700">
              <div style={{ height: Math.max(320, charts.byAssignToAgent.length * 40 + 80), minWidth: 320 }}>
                <Bar
                  data={{
                    labels: charts.byAssignToAgent.map((x) => x.label || "(empty)"),
                    datasets: [{ label: "Tickets", data: charts.byAssignToAgent.map((x) => x.count), backgroundColor: CHART_COLORS }],
                  }}
                  options={{
                    ...barChartOptions("By assign-to agent"),
                    indexAxis: "y",
                    maintainAspectRatio: false,
                    scales: { ...chartOptions.scales, x: { beginAtZero: true } },
                  }}
                />
              </div>
            </div>
          </div>
        )}
        {charts?.byDisposeByAgent?.length > 0 && (
          <div data-pdf-section className="mb-8 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              By dispose-by agent ({charts.byDisposeByAgent.length} agents)
            </h3>
            <div className="rounded border border-zinc-100 dark:border-zinc-700">
              <div style={{ height: Math.max(320, charts.byDisposeByAgent.length * 40 + 80), minWidth: 320 }}>
                <Bar
                  data={{
                    labels: charts.byDisposeByAgent.map((x) => x.label || "(empty)"),
                    datasets: [{ label: "Tickets", data: charts.byDisposeByAgent.map((x) => x.count), backgroundColor: CHART_COLORS }],
                  }}
                  options={{
                    ...barChartOptions("By dispose-by agent"),
                    indexAxis: "y",
                    maintainAspectRatio: false,
                    scales: { ...chartOptions.scales, x: { beginAtZero: true } },
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Charts 2x2 – landing queue, source, create reason */}
        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {charts?.byLandingQueue?.length > 0 && (
            <div data-pdf-section className="min-h-[380px] rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <Bar
                data={{
                  labels: charts.byLandingQueue.map((x) => x.label || "(empty)"),
                  datasets: [{ label: "Tickets", data: charts.byLandingQueue.map((x) => x.count), backgroundColor: CHART_COLORS }],
                }}
                options={barChartOptions("By landing queue")}
              />
            </div>
          )}
          {charts?.bySource?.length > 0 && (
            <div data-pdf-section className="min-h-[380px] rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <Doughnut
                data={{
                  labels: charts.bySource.map((x) => x.label || "(empty)"),
                  datasets: [{ data: charts.bySource.map((x) => x.count), backgroundColor: CHART_COLORS, borderWidth: 0 }],
                }}
                options={doughnutChartOptions("By source")}
              />
            </div>
          )}
          {charts?.byCreateReason?.length > 0 && (
            <div data-pdf-section className="min-h-[380px] rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <Bar
                data={{
                  labels: charts.byCreateReason.map((x) => x.label || "(empty)"),
                  datasets: [{ label: "Tickets", data: charts.byCreateReason.map((x) => x.count), backgroundColor: CHART_COLORS }],
                }}
                options={barChartOptions("By create reason")}
              />
            </div>
          )}
        </div>

        {/* Team Leader, Assign Entry, SLA, Disposition Status */}
        <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {charts?.byTeamLeader?.length > 0 && (
            <div data-pdf-section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <Bar
                data={{
                  labels: charts.byTeamLeader.map((x) => x.label || "(empty)"),
                  datasets: [{ label: "Tickets", data: charts.byTeamLeader.map((x) => x.count), backgroundColor: CHART_COLORS }],
                }}
                options={{ ...barChartOptions("By team leader"), indexAxis: "y", scales: { ...chartOptions.scales, x: { beginAtZero: true } } }}
              />
            </div>
          )}
          {charts?.byAssignEntryStatus?.length > 0 && (
            <div data-pdf-section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <Doughnut
                data={{
                  labels: charts.byAssignEntryStatus.map((x) => x.label || "(empty)"),
                  datasets: [{ data: charts.byAssignEntryStatus.map((x) => x.count), backgroundColor: CHART_COLORS, borderWidth: 0 }],
                }}
                options={doughnutChartOptions("By assign entry status")}
              />
            </div>
          )}
          {charts?.byOldIsOutOfSla?.length > 0 && (
            <div data-pdf-section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <Doughnut
                data={{
                  labels: charts.byOldIsOutOfSla.map((x) => x.label || "(empty)"),
                  datasets: [{ data: charts.byOldIsOutOfSla.map((x) => x.count), backgroundColor: ["rgba(34, 197, 94, 0.8)", "rgba(239, 68, 68, 0.8)", "rgba(156, 163, 175, 0.8)"], borderWidth: 0 }],
                }}
                options={{ responsive: true, plugins: { legend: { position: "bottom" }, title: { display: true, text: "SLA status" } } }}
              />
            </div>
          )}
          {charts?.byDispositionStatus?.length > 0 && (
            <div data-pdf-section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <Doughnut
                data={{
                  labels: charts.byDispositionStatus.map((x) => x.label || "(empty)"),
                  datasets: [{ data: charts.byDispositionStatus.map((x) => x.count), backgroundColor: CHART_COLORS, borderWidth: 0 }],
                }}
                options={doughnutChartOptions("By disposition status")}
              />
            </div>
          )}
        </div>

        {/* Tickets by day */}
        {charts?.byDay?.length > 0 && (
          <div data-pdf-section className="mb-8 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <Line
              data={{
                labels: charts.byDay.map((x) => x.label),
                datasets: [{ label: "Tickets", data: charts.byDay.map((x) => x.count), borderColor: "rgba(59, 130, 246, 1)", backgroundColor: "rgba(59, 130, 246, 0.1)", fill: true, tension: 0.2 }],
              }}
              options={lineChartOptions}
            />
          </div>
        )}
        </div>

        {/* Full details table (hidden by default) + Export */}
        <section className="mt-10 flex flex-wrap items-center gap-4">
          {!showFullDetailsTable ? (
            <button
              type="button"
              onClick={() => setShowFullDetailsTable(true)}
              className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Show full details table ({reports?.total ?? 0} rows) →
            </button>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Full details ({reports?.total ?? 0} rows)
                </h2>
                <button
                  type="button"
                  onClick={() => setShowFullDetailsTable(false)}
                  className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  Hide table
                </button>
              </div>
              <div className="w-full overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                {columns.length === 0 ? (
                  <p className="p-6 text-zinc-500 dark:text-zinc-400">
                    No report data. Upload an Excel file to see full details here.
                  </p>
                ) : (
                  <div
                    ref={tableScrollRef}
                    className="overflow-auto text-left text-sm"
                    style={{ height: "min(70vh, 600px)" }}
                  >
                    <div style={{ minWidth: "max-content" }}>
                      {/* Header row – same grid as body for alignment */}
                      <div
                        className="sticky top-0 z-10 grid border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800"
                        style={{
                          gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))`,
                        }}
                      >
                        {columns.map((col) => (
                          <div key={col} className="whitespace-nowrap px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                            {col}
                          </div>
                        ))}
                      </div>
                      {/* Virtualized body – only visible rows rendered */}
                      <div
                        style={{
                          height: `${rowVirtualizer.getTotalSize()}px`,
                          position: "relative",
                          width: "100%",
                        }}
                      >
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                          const rec = reportsList[virtualRow.index];
                          return (
                            <div
                              key={rec._id ?? virtualRow.key}
                              className="absolute left-0 top-0 grid w-full border-b border-zinc-100 dark:border-zinc-700"
                              style={{
                                transform: `translateY(${virtualRow.start}px)`,
                                gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))`,
                              }}
                            >
                              {columns.map((col) => (
                                <div key={col} className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-400">
                                  {rec.raw?.[col] != null ? String(rec.raw[col]) : ""}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          {reports?.reports?.length > 0 && columns.length > 0 && (
            <button
              type="button"
              onClick={exportCsv}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Export CSV ({reports.total} rows)
            </button>
          )}
        </section>

        <div className="mt-8">
          <Link href="/upload" className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
            Upload new report →
          </Link>
        </div>
      </main>
    </div>
  );
}

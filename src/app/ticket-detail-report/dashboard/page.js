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

ChartJS.defaults.color = "#374151";
ChartJS.defaults.borderColor = "#e5e7eb";
ChartJS.defaults.font.family = "system-ui, sans-serif";

const dataLabelsPlugin = {
  id: "datalabels",
  formatter: (value) => (value != null ? String(value) : ""),
  color: "#1f2937",
  font: { size: 12, weight: "600" },
  anchor: "end",
  align: "end",
  clamp: true,
};
const dataLabelsDoughnut = { ...dataLabelsPlugin, anchor: "center", align: "center", color: "#fff" };
const dataLabelsLine = { ...dataLabelsPlugin, anchor: "end", align: "top" };

const CHART_COLORS = [
  "rgba(59, 130, 246, 0.8)", "rgba(34, 197, 94, 0.8)", "rgba(245, 158, 11, 0.8)", "rgba(239, 68, 68, 0.8)",
  "rgba(168, 85, 247, 0.8)", "rgba(20, 184, 166, 0.8)", "rgba(249, 115, 22, 0.8)", "rgba(236, 72, 153, 0.8)",
];

const API_PREFIX = "/api/ticket-detail-report";

function buildQueryString(filters) {
  const p = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v != null && String(v).trim() !== "") p.set(k, String(v).trim());
  });
  return p.toString();
}

const emptyFilters = {
  dateFrom: "", dateTo: "", assignedTo: "", disposedBy: "", landingQueue: "", lastQueue: "", createReason: "", ticketNo: "",
};

const metricLabels = {
  totalTickets: "Total tickets", totalResolved: "Resolved", overallPending: "Pending",
  resolvedPercent: "Resolved %", pendingPercent: "Pending %", createdToday: "Created today", resolvedToday: "Resolved today",
  outOfSlaCount: "Out of SLA", outOfSlaPercent: "Out of SLA %",
};

export default function TicketDetailDashboardPage() {
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [filterOptions, setFilterOptions] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [reports, setReports] = useState(null);
  const [charts, setCharts] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showFullDetailsTable, setShowFullDetailsTable] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
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
      const reportsQuery = q ? `${q}&limit=50000` : "?limit=50000";
      const [metricsRes, reportsRes, chartsRes] = await Promise.all([
        fetch(`${API_PREFIX}/metrics${q}`),
        fetch(`${API_PREFIX}/reports${reportsQuery}`),
        fetch(`${API_PREFIX}/charts${q}`),
      ]);
      if (!metricsRes.ok) throw new Error("Failed to load metrics");
      if (!reportsRes.ok) throw new Error("Failed to load report details");
      if (!chartsRes.ok) throw new Error("Failed to load chart data");
      const [metricsData, reportsData, chartsData] = await Promise.all([
        metricsRes.json(), reportsRes.json(), chartsRes.json(),
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

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    fetch(`${API_PREFIX}/filter-options`).then((res) => res.ok && res.json().then(setFilterOptions)).catch(() => {});
  }, []);

  const applyFilters = () => setAppliedFilters(filters);
  const clearFilters = () => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); };

  const exportCsv = () => {
    if (!reports?.reports?.length || !columns.length) return;
    const head = columns.join(",");
    const escape = (v) => { const s = v == null ? "" : String(v); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = reports.reports.map((rec) => columns.map((col) => escape(rec.raw?.[col])).join(","));
    const blob = new Blob(["\uFEFF" + [head, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `ticket-detail-report-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const cssColorToHex = (value) => {
    if (!value || value === "transparent") return value;
    try { const parsed = parse(value); return parsed ? formatHex(parsed) : value; } catch { return value; }
  };

  const exportToPdf = async () => {
    if (!pdfExportRef.current) return;
    setPdfExporting(true);
    const saved = new Map();
    const needsConvert = (v) => v && /lab\(|lch\(|oklch\(/.test(v);
    const toHex = (v) => (needsConvert(v) ? cssColorToHex(v) : null);
    const walk = (el, restore) => {
      const s = window.getComputedStyle(el);
      ["color", "backgroundColor", "borderColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"].forEach((prop) => {
        const value = s[prop]; const hex = toHex(value);
        if (hex) {
          if (!restore) { const prev = saved.get(el) || {}; saved.set(el, { ...prev, [prop]: el.style[prop] }); el.style[prop] = hex; }
          else if (saved.has(el) && saved.get(el)[prop] !== undefined) el.style[prop] = saved.get(el)[prop];
        }
      });
      for (const child of el.children) walk(child, restore);
    };
    let savedRoot = null;
    try {
      const root = pdfExportRef.current;
      savedRoot = { overflow: root.style.overflow, height: root.style.height, maxHeight: root.style.maxHeight };
      root.style.overflow = "visible"; root.style.height = "auto"; root.style.maxHeight = "none";
      walk(root, false);
      const canvas = await html2canvas(root, { scale: 2, useCORS: true, backgroundColor: "#fafafa", logging: false });
      walk(root, true);
      const imgData = canvas.toDataURL("image/png");
      const pageW = 210, imgH = (canvas.height * pageW) / canvas.width;
      const pdf = new jsPDF("p", "mm", [pageW, imgH]);
      pdf.addImage(imgData, "PNG", 0, 0, pageW, imgH);
      pdf.save(`ticket-detail-dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setPdfExporting(false);
      if (pdfExportRef.current && savedRoot) {
        const r = pdfExportRef.current;
        r.style.overflow = savedRoot.overflow ?? ""; r.style.height = savedRoot.height ?? ""; r.style.maxHeight = savedRoot.maxHeight ?? "";
      }
    }
  };

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <Link href="/" className="mt-4 text-zinc-600 hover:underline dark:text-zinc-400">← Home</Link>
      </div>
    );
  }
  if (loading && !metrics) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-zinc-600 dark:text-zinc-400">Loading ticket detail dashboard…</p></div>;
  }

  const columns = reports?.reports?.length > 0 ? Object.keys(reports.reports[0].raw || {}) : [];
  const chartTextColor = "#374151";
  const chartOptions = {
    responsive: true,
    plugins: { legend: { display: false }, title: { display: true, color: chartTextColor }, tooltip: { titleColor: "#fff", bodyColor: "#fff" }, datalabels: dataLabelsPlugin },
    scales: { y: { beginAtZero: true, ticks: { color: chartTextColor } }, x: { ticks: { color: chartTextColor } } },
  };
  const barChartOptions = (title) => ({ ...chartOptions, plugins: { ...chartOptions.plugins, title: { display: true, text: title, color: chartTextColor } } });
  const doughnutChartOptions = (title) => ({
    responsive: true,
    plugins: { legend: { position: "bottom", labels: { color: chartTextColor } }, title: { display: true, text: title, color: chartTextColor }, tooltip: { titleColor: "#fff", bodyColor: "#fff" }, datalabels: dataLabelsDoughnut },
  });
  const lineChartOptions = {
    ...chartOptions,
    plugins: { ...chartOptions.plugins, title: { display: true, text: "Tickets by day", color: chartTextColor } },
    scales: { ...chartOptions.scales, x: { ...chartOptions.scales.x, title: { display: true, text: "Date", color: chartTextColor } } },
  };

  const barData = metrics ? { labels: ["Created today", "Resolved today"], datasets: [{ label: "Count", data: [metrics.createdToday, metrics.resolvedToday], backgroundColor: CHART_COLORS.slice(0, 2) }] } : null;
  const doughnutData = metrics ? { labels: ["Resolved", "Pending"], datasets: [{ data: [metrics.totalResolved, metrics.overallPending], backgroundColor: ["rgba(34, 197, 94, 0.8)", "rgba(245, 158, 11, 0.8)"], borderWidth: 0 }] } : null;

  const renderBarChart = (data, title, horizontal = false) => (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <Bar
        data={{ labels: data.map((x) => x.label || "(empty)"), datasets: [{ label: "Count", data: data.map((x) => x.count), backgroundColor: CHART_COLORS }] }}
        options={horizontal ? { ...barChartOptions(title), indexAxis: "y", maintainAspectRatio: false } : barChartOptions(title)}
      />
    </div>
  );

  const moreChartConfigs = [
    { key: "byLandingFolder", title: "Landing Folder" }, { key: "bySubFolder", title: "Sub Folder" },
    { key: "byCurrentQueueName", title: "Current Queue Name" }, { key: "byQueueGroupName", title: "QueueGroup Name" }, { key: "byFirstResolvedQueue", title: "First Resolved Queue" },
    { key: "bySicName", title: "SIC Name" }, { key: "byAsicName", title: "ASIC Name" }, { key: "byBccdState", title: "BCCD State" }, { key: "byBccdCity", title: "BCCD City" },
    { key: "byAssignedEmpCity", title: "Assigned Emp City" }, { key: "byAssigneeManagerName", title: "Assignee Manager" },
    { key: "byLastReopenBy", title: "Last Reopen By" }, { key: "byDisposeFolderGroup", title: "Dispose Folder Group" },
    { key: "byFirstResolvedByAgentCenter", title: "First Resolved By Agent Center" }, { key: "byLastResolvedByAgentCenter", title: "Last Resolved By Agent Center" },
    { key: "byFirstResponseSla", title: "First Response SLA" }, { key: "byFirstResponseSlaNew", title: "First Response SLA (New)" }, { key: "byFolderSla", title: "Folder SLA" },
    { key: "byCreateToFirstDisposeFolderSla", title: "Create To First Dispose Folder SLA" }, { key: "byPendingAtDesignation", title: "Pending At Designation" },
    { key: "byResolvedByUploader", title: "Resolved By Uploader" }, { key: "byLastSourceType", title: "Last Source Type" }, { key: "byCreatedBy", title: "Created By" },
    { key: "byLandingFolderHierarchy", title: "Landing Folder Hierarchy" },
  ];

  const opts = filterOptions || {};

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <Link href="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">← Home</Link>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Ticket Detail Report Dashboard</h1>

        <section className="mb-8 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Filters</h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <div><label className="mb-1 block text-xs text-zinc-500">Date from</label><input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" /></div>
            <div><label className="mb-1 block text-xs text-zinc-500">Date to</label><input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" /></div>
            <div><label className="mb-1 block text-xs text-zinc-500">Assigned To</label><select value={filters.assignedTo} onChange={(e) => setFilters((f) => ({ ...f, assignedTo: e.target.value }))} className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"><option value="">All</option>{(opts.assignedToOptions || []).map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
            <div><label className="mb-1 block text-xs text-zinc-500">Disposed By</label><select value={filters.disposedBy} onChange={(e) => setFilters((f) => ({ ...f, disposedBy: e.target.value }))} className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"><option value="">All</option>{(opts.disposedByOptions || []).map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
            <div><label className="mb-1 block text-xs text-zinc-500">Landing Queue</label><select value={filters.landingQueue} onChange={(e) => setFilters((f) => ({ ...f, landingQueue: e.target.value }))} className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"><option value="">All</option>{(opts.landingQueueOptions || []).map((q) => <option key={q} value={q}>{q}</option>)}</select></div>
            <div><label className="mb-1 block text-xs text-zinc-500">Last Queue</label><select value={filters.lastQueue} onChange={(e) => setFilters((f) => ({ ...f, lastQueue: e.target.value }))} className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"><option value="">All</option>{(opts.lastQueueOptions || []).map((q) => <option key={q} value={q}>{q}</option>)}</select></div>
            <div><label className="mb-1 block text-xs text-zinc-500">Create Reason</label><select value={filters.createReason} onChange={(e) => setFilters((f) => ({ ...f, createReason: e.target.value }))} className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"><option value="">All</option>{(opts.createReasonOptions || []).map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
            <div><label className="mb-1 block text-xs text-zinc-500">Ticket No</label><input type="text" placeholder="e.g. 4773469874340" value={filters.ticketNo} onChange={(e) => setFilters((f) => ({ ...f, ticketNo: e.target.value }))} className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" /></div>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={applyFilters} disabled={loading} className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">Apply</button>
            <button type="button" onClick={clearFilters} className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800">Clear filters</button>
          </div>
        </section>

        {loading && metrics && <p className="mb-4 text-sm text-zinc-500">Updating data…</p>}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={exportToPdf} disabled={!metrics || pdfExporting} className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 inline-flex items-center gap-2">
            {pdfExporting ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
                Exporting…
              </>
            ) : (
              "Export summary & charts to PDF"
            )}
          </button>
        </div>
        {reports && (
          <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
            Showing <span className="font-medium text-zinc-900 dark:text-zinc-100">{reports.reports?.length ?? 0}</span> of <span className="font-medium text-zinc-900 dark:text-zinc-100">{reports.total ?? 0}</span> records
            {reports.total > 50000 && <span className="ml-1 text-amber-600 dark:text-amber-400">(max 50,000 loaded; use filters to narrow)</span>}
          </p>
        )}

        <div ref={pdfExportRef} className="rounded-lg bg-white p-4 dark:bg-zinc-900">
          {metrics && (
            <div className="mb-8 rounded-xl border-2 border-zinc-200 bg-zinc-50/80 p-6 dark:border-zinc-700 dark:bg-zinc-800/50">
              <h2 className="mb-4 text-base font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Record overview</h2>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">{metrics.totalTickets?.toLocaleString() ?? 0}</span>
                <span className="text-zinc-500 dark:text-zinc-400">total records</span>
                <span className="text-zinc-400">|</span>
                <span className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">{metrics.resolvedPercent ?? 0}% resolved</span>
                <span className="text-zinc-500">({metrics.totalResolved?.toLocaleString() ?? 0})</span>
                <span className="text-zinc-400">|</span>
                <span className="text-xl font-semibold text-amber-600 dark:text-amber-400">{metrics.pendingPercent ?? 0}% pending</span>
                <span className="text-zinc-500">({metrics.overallPending?.toLocaleString() ?? 0})</span>
                <span className="text-zinc-400">|</span>
                <span className="text-lg font-medium text-red-600 dark:text-red-400">{metrics.outOfSlaCount ?? 0} out of SLA</span>
                <span className="text-zinc-500">({metrics.outOfSlaPercent ?? 0}%)</span>
                <span className="text-zinc-400">|</span>
                <span className="text-zinc-600 dark:text-zinc-300">Today: {metrics.createdToday ?? 0} created, {metrics.resolvedToday ?? 0} resolved</span>
              </div>
            </div>
          )}

          <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics && Object.entries(metricLabels).map(([key, label]) => (
              <div key={key} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{metrics[key] ?? 0}</p>
              </div>
            ))}
          </div>

          <div className="mb-8 grid gap-6 sm:grid-cols-2">
            {barData && <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"><Bar data={barData} options={barChartOptions("Today metrics")} /></div>}
            {doughnutData && <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"><Doughnut data={doughnutData} options={doughnutChartOptions("Resolved vs Pending")} /></div>}
          </div>

          <div className="mb-8 grid gap-6 sm:grid-cols-2">
            {charts?.byAssignedTo?.length > 0 && <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"><h3 className="mb-2 text-sm font-semibold uppercase text-zinc-500 dark:text-zinc-400">By Assigned To</h3><div style={{ height: Math.max(320, charts.byAssignedTo.length * 32 + 80), minWidth: 280 }}><Bar data={{ labels: charts.byAssignedTo.map((x) => x.label || "(empty)"), datasets: [{ label: "Tickets", data: charts.byAssignedTo.map((x) => x.count), backgroundColor: CHART_COLORS }] }} options={{ ...barChartOptions("By Assigned To"), indexAxis: "y", maintainAspectRatio: false }} /></div></div>}
            {charts?.byDisposedBy?.length > 0 && <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"><h3 className="mb-2 text-sm font-semibold uppercase text-zinc-500 dark:text-zinc-400">By Disposed By</h3><div style={{ height: Math.max(320, charts.byDisposedBy.length * 32 + 80), minWidth: 280 }}><Bar data={{ labels: charts.byDisposedBy.map((x) => x.label || "(empty)"), datasets: [{ label: "Tickets", data: charts.byDisposedBy.map((x) => x.count), backgroundColor: CHART_COLORS }] }} options={{ ...barChartOptions("By Disposed By"), indexAxis: "y", maintainAspectRatio: false }} /></div></div>}
          </div>

          <div className="mb-8 grid gap-6 sm:grid-cols-3">
            {charts?.byLandingQueue?.length > 0 && renderBarChart(charts.byLandingQueue, "By Landing Queue")}
            {charts?.byLastQueue?.length > 0 && renderBarChart(charts.byLastQueue, "By Last Queue")}
            {charts?.byCreateReason?.length > 0 && renderBarChart(charts.byCreateReason, "By Create Reason")}
          </div>

          {(charts?.byDay?.length > 0 || charts?.byMonth?.length > 0) && (
            <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {charts?.byDay?.length > 0 && (
                <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                  <h3 className="mb-2 text-sm font-semibold uppercase text-zinc-500 dark:text-zinc-400">Tickets by day</h3>
                  <Line data={{ labels: charts.byDay.map((x) => x.label), datasets: [{ label: "Tickets", data: charts.byDay.map((x) => x.count), borderColor: "rgba(59, 130, 246, 1)", backgroundColor: "rgba(59, 130, 246, 0.1)", fill: true, tension: 0.2 }] }} options={lineChartOptions} />
                </div>
              )}
              {charts?.byMonth?.length > 0 && (
                <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                  <h3 className="mb-2 text-sm font-semibold uppercase text-zinc-500 dark:text-zinc-400">Tickets by month</h3>
                  <Line data={{ labels: charts.byMonth.map((x) => x.label), datasets: [{ label: "Tickets", data: charts.byMonth.map((x) => x.count), borderColor: "rgba(20, 184, 166, 1)", backgroundColor: "rgba(20, 184, 166, 0.1)", fill: true, tension: 0.2 }] }} options={{ ...lineChartOptions, plugins: { ...lineChartOptions.plugins, title: { display: true, text: "Tickets by month", color: chartTextColor } } }} />
                </div>
              )}
            </div>
          )}

          {(charts?.byDaySlaStatus?.length > 0 || charts?.byTicketType?.length > 0) && (
            <div className="mb-8">
              <h2 className="mb-4 text-sm font-semibold uppercase text-zinc-500 dark:text-zinc-400">SLA & status</h2>
              <div className="grid gap-6 sm:grid-cols-2">
                {charts?.byDaySlaStatus?.length > 0 && renderBarChart(charts.byDaySlaStatus, "Day SLA Status")}
                {charts?.byTicketType?.length > 0 && <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"><Doughnut data={{ labels: charts.byTicketType.map((x) => x.label || "(empty)"), datasets: [{ data: charts.byTicketType.map((x) => x.count), backgroundColor: CHART_COLORS, borderWidth: 0 }] }} options={doughnutChartOptions("Ticket type (parent/sub)")} /></div>}
              </div>
            </div>
          )}

          {(charts?.byCreateSourceType?.length > 0 || charts?.byFolder?.length > 0) && (
            <div className="mb-8">
              <h2 className="mb-4 text-sm font-semibold uppercase text-zinc-500 dark:text-zinc-400">Create source & folder</h2>
              <div className="grid gap-6 sm:grid-cols-2">
                {charts?.byCreateSourceType?.length > 0 && renderBarChart(charts.byCreateSourceType, "Create Source Type")}
                {charts?.byFolder?.length > 0 && renderBarChart(charts.byFolder, "Folder")}
              </div>
            </div>
          )}

          {(charts?.byFtr?.length > 0 || charts?.byBranch?.length > 0 || charts?.byMoc?.length > 0) && (
            <div className="mb-8">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {charts?.byFtr?.length > 0 && (
                  <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                    <h2 className="mb-3 text-sm font-semibold uppercase text-zinc-500 dark:text-zinc-400">FTR (First Time Resolution)</h2>
                    <Doughnut data={{ labels: charts.byFtr.map((x) => x.label || "(empty)"), datasets: [{ data: charts.byFtr.map((x) => x.count), backgroundColor: CHART_COLORS, borderWidth: 0 }] }} options={doughnutChartOptions("FTR")} />
                  </div>
                )}
                {(charts?.byBranch?.length > 0 || charts?.byMoc?.length > 0) && (
                  <div className="space-y-4">
                    <h2 className="text-sm font-semibold uppercase text-zinc-500 dark:text-zinc-400">Branch & MOC</h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {charts?.byBranch?.length > 0 && renderBarChart(charts.byBranch, "BRANCH")}
                      {charts?.byMoc?.length > 0 && renderBarChart(charts.byMoc, "MOC")}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {(charts?.byResolvedBy?.length > 0 || charts?.byFirstResponseBy?.length > 0) && (
            <div className="mb-8">
              <h2 className="mb-4 text-sm font-semibold uppercase text-zinc-500 dark:text-zinc-400">By people (Resolved By / First Response By)</h2>
              <div className="grid gap-6 sm:grid-cols-2">
                {charts?.byResolvedBy?.length > 0 && <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"><h3 className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Resolved By</h3><div style={{ height: Math.max(280, charts.byResolvedBy.length * 28 + 60), minWidth: 260 }}><Bar data={{ labels: charts.byResolvedBy.map((x) => x.label || "(empty)"), datasets: [{ label: "Tickets", data: charts.byResolvedBy.map((x) => x.count), backgroundColor: CHART_COLORS }] }} options={{ ...barChartOptions("Resolved By"), indexAxis: "y", maintainAspectRatio: false }} /></div></div>}
                {charts?.byFirstResponseBy?.length > 0 && <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"><h3 className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">First Response By</h3><div style={{ height: Math.max(280, charts.byFirstResponseBy.length * 28 + 60), minWidth: 260 }}><Bar data={{ labels: charts.byFirstResponseBy.map((x) => x.label || "(empty)"), datasets: [{ label: "Tickets", data: charts.byFirstResponseBy.map((x) => x.count), backgroundColor: CHART_COLORS }] }} options={{ ...barChartOptions("First Response By"), indexAxis: "y", maintainAspectRatio: false }} /></div></div>}
              </div>
            </div>
          )}

          {/* First Assignee Employee & Disposed Folder – horizontal bars, 2×1 row */}
          {(charts?.byFirstAssigneeEmployeeName?.length > 0 || charts?.byDisposedFolder?.length > 0) && (
            <div className="mb-8">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                First Assignee Employee & Disposed Folder
              </h2>
              <div className="grid gap-6 grid-cols-1 sm:grid-cols-2">
                {charts?.byFirstAssigneeEmployeeName?.length > 0 && (
                  <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                    <h3 className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">First Assignee Employee</h3>
                    <div style={{ height: Math.max(280, charts.byFirstAssigneeEmployeeName.length * 28 + 60), minWidth: 260 }}>
                      <Bar
                        data={{
                          labels: charts.byFirstAssigneeEmployeeName.map((x) => x.label || "(empty)"),
                          datasets: [{ label: "Tickets", data: charts.byFirstAssigneeEmployeeName.map((x) => x.count), backgroundColor: CHART_COLORS }],
                        }}
                        options={{ ...barChartOptions("First Assignee Employee"), indexAxis: "y", maintainAspectRatio: false }}
                      />
                    </div>
                  </div>
                )}
                {charts?.byDisposedFolder?.length > 0 && (
                  <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                    <h3 className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Disposed Folder</h3>
                    <div style={{ height: Math.max(280, charts.byDisposedFolder.length * 28 + 60), minWidth: 260 }}>
                      <Bar
                        data={{
                          labels: charts.byDisposedFolder.map((x) => x.label || "(empty)"),
                          datasets: [{ label: "Tickets", data: charts.byDisposedFolder.map((x) => x.count), backgroundColor: CHART_COLORS }],
                        }}
                        options={{ ...barChartOptions("Disposed Folder"), indexAxis: "y", maintainAspectRatio: false }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {(charts?.byDispositionFolderLevel3?.length > 0 || charts?.byDispositionFolderLevel4?.length > 0 || charts?.byDispositionFolderHierarchy?.length > 0) && (
            <div className="mb-8">
              <h2 className="mb-4 text-sm font-semibold uppercase text-zinc-500 dark:text-zinc-400">Disposition folders</h2>
              <div className="grid gap-6 grid-cols-1 sm:grid-cols-2">
                {charts?.byDispositionFolderLevel3?.length > 0 && (
                  <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                    <h3 className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Disposition Folder L3</h3>
                    <div style={{ height: Math.max(280, charts.byDispositionFolderLevel3.length * 28 + 60), minWidth: 260 }}>
                      <Bar
                        data={{
                          labels: charts.byDispositionFolderLevel3.map((x) => x.label || "(empty)"),
                          datasets: [{ label: "Tickets", data: charts.byDispositionFolderLevel3.map((x) => x.count), backgroundColor: CHART_COLORS }],
                        }}
                        options={{ ...barChartOptions("Disposition Folder L3"), indexAxis: "y", maintainAspectRatio: false }}
                      />
                    </div>
                  </div>
                )}
                {charts?.byDispositionFolderLevel4?.length > 0 && (
                  <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                    <h3 className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Disposition Folder L4</h3>
                    <div style={{ height: Math.max(280, charts.byDispositionFolderLevel4.length * 28 + 60), minWidth: 260 }}>
                      <Bar
                        data={{
                          labels: charts.byDispositionFolderLevel4.map((x) => x.label || "(empty)"),
                          datasets: [{ label: "Tickets", data: charts.byDispositionFolderLevel4.map((x) => x.count), backgroundColor: CHART_COLORS }],
                        }}
                        options={{ ...barChartOptions("Disposition Folder L4"), indexAxis: "y", maintainAspectRatio: false }}
                      />
                    </div>
                  </div>
                )}
                {charts?.byDispositionFolderHierarchy?.length > 0 && (
                  <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900 sm:col-span-2">
                    <h3 className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Disposition Folder Hierarchy</h3>
                    <div style={{ height: Math.max(280, charts.byDispositionFolderHierarchy.length * 28 + 60), minWidth: 260 }}>
                      <Bar
                        data={{
                          labels: charts.byDispositionFolderHierarchy.map((x) => x.label || "(empty)"),
                          datasets: [{ label: "Tickets", data: charts.byDispositionFolderHierarchy.map((x) => x.count), backgroundColor: CHART_COLORS }],
                        }}
                        options={{ ...barChartOptions("Disposition Folder Hierarchy"), indexAxis: "y", maintainAspectRatio: false }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mb-8">
            <h2 className="mb-4 text-sm font-semibold uppercase text-zinc-500 dark:text-zinc-400">More data – folders, queues, location, SLA, people</h2>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              {moreChartConfigs.map(({ key, title }) => {
                const data = charts?.[key];
                if (!data?.length) return null;
                return <div key={key} className="min-h-[260px]">{renderBarChart(data, title)}</div>;
              })}
            </div>
          </div>
        </div>

        <section className="mt-10 flex flex-wrap items-center gap-4">
          {!showFullDetailsTable ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setShowFullDetailsTable(true)} className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                Show full details table ({reports?.reports?.length ?? 0} of {reports?.total ?? 0} records) →
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Full details ({reports?.total ?? 0} rows)</h2>
                <button type="button" onClick={() => setShowFullDetailsTable(false)} className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Hide table</button>
              </div>
              <div className="w-full overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                {columns.length === 0 ? <p className="p-6 text-zinc-500 dark:text-zinc-400">No report data. Upload an Excel file to see full details here.</p> : (
                  <div ref={tableScrollRef} className="overflow-auto text-left text-sm" style={{ height: "min(70vh, 600px)" }}>
                    <div style={{ minWidth: "max-content" }}>
                      <div className="sticky top-0 z-10 grid border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))` }}>
                        {columns.map((col) => <div key={col} className="whitespace-nowrap px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">{col}</div>)}
                      </div>
                      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}>
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                          const rec = reportsList[virtualRow.index];
                          return (
                            <div key={rec._id ?? virtualRow.key} className="absolute left-0 top-0 grid w-full border-b border-zinc-100 dark:border-zinc-700" style={{ transform: `translateY(${virtualRow.start}px)`, gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))` }}>
                              {columns.map((col) => <div key={col} className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-400">{rec.raw?.[col] != null ? String(rec.raw[col]) : ""}</div>)}
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
          {reports?.reports?.length > 0 && columns.length > 0 && <button type="button" onClick={exportCsv} className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">Export CSV ({reports.total} rows)</button>}
        </section>

        <div className="mt-8 flex gap-4">
          <Link href="/ticket-detail-report/upload" className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Upload new ticket detail report →</Link>
          <Link href="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">← Home</Link>
        </div>
      </main>
    </div>
  );
}

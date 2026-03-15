import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import connect from "@/lib/db";
import TicketDetailReport from "@/models/TicketDetailReport";

/** Parse date from Excel/JS: Date, Excel serial number, or DD/MM/YYYY(-style) string. */
function parseDate(val) {
  if (val == null || val === "") return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "number") {
    // Excel serial (days since 1900-01-01); 25569 = 1970-01-01
    const d = new Date((val - 25569) * 86400 * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(val).trim();
  if (!s) return null;
  // DD/MM/YYYY or DD-MM-YYYY (and optionally time)
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const [, day, month, year] = dmy;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/** Try multiple possible header names (Excel may have slight variations) */
function get(r, ...names) {
  for (const n of names) {
    if (r[n] !== undefined && r[n] !== null && r[n] !== "") return r[n];
  }
  return null;
}

/** Normalize raw object keys: strip BOM and trim so charts/filters match. */
function normalizeRawKeys(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const cleanKey = key.replace(/^\uFEFF/, "").trim();
    out[cleanKey] = value;
  }
  return out;
}

function parseDateTime(row, dateKey, timeKey) {
  const dateVal = get(row, dateKey);
  const timeVal = get(row, timeKey);
  if (!dateVal) return null;
  const d = parseDate(dateVal);
  if (!d) return null;
  if (timeVal != null && String(timeVal).trim() !== "") {
    const t = String(timeVal).trim();
    const [h, m, s] = t.split(/[:\s]/).map(Number);
    if (!isNaN(h)) d.setHours(h || 0, m || 0, s || 0, 0);
  }
  return d;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json(
        { message: "No file uploaded" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    const docs = rows.map((r) => {
      const raw = normalizeRawKeys(r);
      const createdAt = parseDateTime(raw, "Created Date", "Created Time");
      const resolvedAt = parseDateTime(raw, "Resolved Date", "Resolved Time");
      const ticketNo = String(get(raw, "Ticket No", "Ticket No.") ?? "").trim();
      const assignedTo = String(get(raw, "Assigned To") ?? "").trim();
      const disposedBy = String(get(raw, "Disposed By") ?? "").trim();
      const landingQueue = String(get(raw, "Landing Queue") ?? "").trim();
      const lastQueue = String(get(raw, "Last Queue") ?? "").trim();
      const createReason = String(get(raw, "Create Reason") ?? "").trim();

      return {
        ticketNo,
        createdAt,
        resolvedAt,
        assignedTo,
        disposedBy,
        landingQueue,
        lastQueue,
        createReason,
        raw,
      };
    });

    await connect();
    await TicketDetailReport.deleteMany({});
    await TicketDetailReport.insertMany(docs);

    return NextResponse.json({
      message: "Ticket detail report imported successfully",
      count: docs.length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { message: "Import failed", error: err.message },
      { status: 500 }
    );
  }
}

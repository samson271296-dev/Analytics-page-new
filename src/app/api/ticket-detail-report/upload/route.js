import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import connect from "@/lib/db";
import TicketDetailReport from "@/models/TicketDetailReport";

function parseDate(val) {
  if (val == null || val === "") return null;
  if (val instanceof Date) return val;
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
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    const docs = rows.map((r) => {
      const createdAt = parseDateTime(r, "Created Date", "Created Time");
      const resolvedAt = parseDateTime(r, "Resolved Date", "Resolved Time");
      const ticketNo = String(get(r, "Ticket No", "Ticket No.") ?? "").trim();
      const assignedTo = String(get(r, "Assigned To") ?? "").trim();
      const disposedBy = String(get(r, "Disposed By") ?? "").trim();
      const landingQueue = String(get(r, "Landing Queue") ?? "").trim();
      const lastQueue = String(get(r, "Last Queue") ?? "").trim();
      const createReason = String(get(r, "Create Reason") ?? "").trim();

      return {
        ticketNo,
        createdAt,
        resolvedAt,
        assignedTo,
        disposedBy,
        landingQueue,
        lastQueue,
        createReason,
        raw: { ...r },
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

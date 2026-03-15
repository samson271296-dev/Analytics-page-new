import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import connect from "@/lib/db";
import AssignedToResolveReport from "@/models/AssignedToResolveReport";

// Parse dates coming from Excel: Date objects, Excel serial numbers, or strings.
function parseDate(val) {
  if (val == null || val === "") return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "number") {
    // Excel serial: days since 1900-01-01, with 25569 = 1970-01-01
    const d = new Date((val - 25569) * 86400 * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
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
      const get = (...names) => {
        for (const n of names) {
          if (r[n] !== undefined && r[n] !== null && r[n] !== "") return r[n];
        }
        return null;
      };
      const createdAt = parseDate(
        get("Create/Open/Reassign Date", "Create/Open/Reassign Date")
      );
      const assignedAt = parseDate(get("ticketAssignedDate"));
      const disposedDate = parseDate(get("disposedDate"));
      const dispositionSubStatus = String(
        get("DispositionSubStatus", "DispositionSubStatus") ?? ""
      );
      const customerRepliedCount = Number(get("customerRepliedCount")) || 0;
      const ticketId = String(get("ticketId", "Ticket ID") ?? "");
      return {
        ticketId,
        createdAt,
        assignedAt,
        resolvedAt: disposedDate,
        dispositionSubStatus,
        customerRepliedCount,
        raw: { ...r },
      };
    });

    await connect();
    await AssignedToResolveReport.deleteMany({});
    await AssignedToResolveReport.insertMany(docs);

    return NextResponse.json({
      message: "File imported successfully",
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

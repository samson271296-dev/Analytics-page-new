import { NextResponse } from "next/server";
import connect from "@/lib/db";
import { cacheHeaders } from "@/lib/cache-headers";
import TicketDetailReport from "@/models/TicketDetailReport";

function parseDate(val) {
  if (val == null || val === "") return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function parseDateTime(dateStr, timeStr) {
  if (dateStr == null || String(dateStr).trim() === "") return null;
  const dateOnly = String(dateStr).trim();
  const timeOnly = timeStr != null && String(timeStr).trim() !== "" ? String(timeStr).trim() : null;
  const combined = timeOnly ? `${dateOnly}T${timeOnly}` : `${dateOnly}T00:00:00`;
  const d = new Date(combined);
  return isNaN(d.getTime()) ? null : d;
}

/** GET: return report rows with full details. Supports filters and pagination. */
export async function GET(request) {
  try {
    await connect();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(0, parseInt(searchParams.get("limit") || "0", 10)) || 10000,
      50000
    );
    const skip = Math.max(0, parseInt(searchParams.get("skip") || "0", 10));

    const dateFrom = searchParams.get("dateFrom")?.trim();
    const timeFrom = searchParams.get("timeFrom")?.trim();
    const dateTo = searchParams.get("dateTo")?.trim();
    const timeTo = searchParams.get("timeTo")?.trim();
    const startDate = parseDateTime(dateFrom, timeFrom);
    const endDate = dateTo ? (timeTo ? parseDateTime(dateTo, timeTo) : (() => { const e = new Date(dateTo + "T23:59:59.999"); return isNaN(e.getTime()) ? null : e; })()) : null;
    const assignedTo = searchParams.get("assignedTo")?.trim();
    const excludeAssignedTo = (searchParams.getAll?.("excludeAssignedTo") || []).filter(Boolean);
    const disposedBy = searchParams.get("disposedBy")?.trim();
    const landingQueue = searchParams.get("landingQueue")?.trim();
    const lastQueue = searchParams.get("lastQueue")?.trim();
    const createReason = searchParams.get("createReason")?.trim();
    const ticketNo = searchParams.get("ticketNo")?.trim();

    const query = {};

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }
    if (assignedTo) query.assignedTo = assignedTo;
    else if (excludeAssignedTo.length > 0) query.assignedTo = { $nin: excludeAssignedTo };
    if (disposedBy) query.disposedBy = disposedBy;
    if (landingQueue) query.landingQueue = landingQueue;
    if (lastQueue) query.lastQueue = lastQueue;
    if (createReason) query.createReason = createReason;
    if (ticketNo) query.ticketNo = ticketNo;

    const total = await TicketDetailReport.countDocuments(query);
    const reports = await TicketDetailReport.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return NextResponse.json(
      { total, skip, limit, reports },
      { headers: cacheHeaders }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { message: "Failed to fetch reports", error: err.message },
      { status: 500 }
    );
  }
}
